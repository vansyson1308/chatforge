import type {
  ForgeRound,
  ForgeStage,
  ForgeView,
  GateReport,
} from "../../../packages/shared/src/forge.js";
import { formatCredits } from "../../../packages/shared/src/forge.js";
import type { Chat, Idea } from "../../../packages/shared/src/chat.js";
import type { HostCheckpoint } from "./mod-host.js";
import type { GateInput } from "./gatekeeper.js";
import { inspectMod } from "./gatekeeper.js";
import type { Builder } from "./builder.js";
import type { Producer } from "./producer.js";
import { worldOnlyReason } from "./producer.js";
import { IdeaInbox, sanitize } from "./chat-router.js";
import { ForgeStore } from "./forge-store.js";
import type { CodePreview } from "./live-code.js";

export interface ForgeSimulation {
  checkpoint(): Promise<HostCheckpoint>;
  deploy(id: string, source: string): Promise<void>;
  rollback(id?: string): Promise<HostCheckpoint>;
  safeMode(): Promise<HostCheckpoint>;
  celebrate(text: string): Promise<void>;
  retire?(id: string): Promise<HostCheckpoint>;
  restore?(checkpoint: HostCheckpoint): Promise<void>;
  showcase?(id: string, command?: string, event?: string): Promise<void>;
}
export interface ForgeOptions {
  producer: Producer;
  builder: Builder;
  simulation: ForgeSimulation;
  gate(
    input: GateInput,
    signal: AbortSignal,
    onCheck?: (check: GateReport["checks"][number]) => void,
  ): Promise<GateReport>;
  broadcast(view: ForgeView): void;
  announce(text: string, eventKey?: string): void;
  resetRound(): void;
  now?: () => number;
  buildTimeoutMs?: number;
  buildCap?: number;
  diagnostic?(error: unknown): void;
  connection?(): { twitchEnabled: boolean; eventsub: string };
  autoCollect?: boolean;
  feed?(): { author: string; text: string; source: string }[];
  showcaseMs?: number;
}
const presets = {
  demo: { collect: 45000, vote: 30000, approval: 10000 },
  normal: { collect: 90000, vote: 45000, approval: null },
};
const transitions: Record<ForgeStage, ForgeStage[]> = {
  IDLE: ["COLLECTING"],
  COLLECTING: ["CURATING", "FAILED"],
  CURATING: ["VOTING", "FAILED"],
  VOTING: ["STREAMER_APPROVAL", "FAILED"],
  STREAMER_APPROVAL: ["BUILDING", "FAILED"],
  BUILDING: ["TESTING", "FAILED"],
  TESTING: ["BUILDING", "DEPLOYING", "FAILED"],
  DEPLOYING: ["SHOWCASE", "FAILED"],
  SHOWCASE: ["LIVE", "ROLLED_BACK", "FAILED"],
  LIVE: ["IDLE", "ROLLED_BACK"],
  FAILED: ["IDLE"],
  ROLLED_BACK: ["IDLE"],
};
export class ForgeLoop {
  readonly store: ForgeStore;
  running = false;
  preset: "demo" | "normal" = "demo";
  round: ForgeRound | null = null;
  build: ForgeRound | null = null;
  notice = "Forge ready";
  activity: string[] = [];
  private code?: CodePreview;
  private timer?: NodeJS.Timeout;
  private curating = false;
  private building = false;
  private curationAbort?: AbortController;
  private buildAbort?: AbortController;
  private finishedAt = 0;
  private buildStartedAt = 0;
  private showcaseAt = 0;
  private activeBuildId?: number;
  private showcaseAction?: { command?: string; event?: string };
  private showcaseFired = false;
  private showcasePending = false;
  private previousBuild = true;
  private forcedWinner?: number;
  private lastOpenRound?: number;
  private acknowledgedIdeas = new Set<number>();
  private tasks = new Set<Promise<void>>();
  private now: () => number;
  constructor(
    readonly inbox: IdeaInbox,
    private options: ForgeOptions,
  ) {
    this.store = new ForgeStore(inbox.db);
    this.now = options.now ?? Date.now;
    // Interrupted AI/build work is never silently deployed or billed again on restart.
    for (const round of this.store.latestRounds()) {
      if (round.stage === "SHOWCASE") {
        round.stage = "LIVE";
        round.deadline = null;
        this.store.save(round, this.now());
        this.inbox.db
          .prepare(
            "UPDATE builds SET status='LIVE' WHERE roundId=? AND status='SHOWCASE'",
          )
          .run(round.id);
        this.build ??= round;
      } else if (
        ["BUILDING", "TESTING", "DEPLOYING", "CURATING"].includes(round.stage)
      ) {
        round.stage = "FAILED";
        round.deadline = null;
        this.store.save(round, this.now());
        this.inbox.db
          .prepare(
            "UPDATE builds SET status='FAILED' WHERE roundId=? AND status IN ('BUILDING','TESTING','DEPLOYING')",
          )
          .run(round.id);
        this.notice =
          "Interrupted work stopped safely; live checkpoint restored";
        this.build ??= round;
      } else if (
        ["COLLECTING", "VOTING", "STREAMER_APPROVAL"].includes(round.stage) &&
        !this.round
      )
        this.round = round;
      else this.build ??= round;
    }
  }
  private track(task: Promise<void>): void {
    this.tasks.add(task);
    void task.finally(() => this.tasks.delete(task));
  }
  view(): ForgeView {
    return {
      type: "forge",
      code: this.code,
      previousBuild: this.previousBuild && !!this.build,
      running: this.running,
      connection: this.options.connection?.(),
      preset: this.preset,
      season: this.store.season,
      round: this.round,
      build: this.build
        ? {
            ...this.build,
            durationMs: this.building
              ? this.now() - this.buildStartedAt
              : this.build.durationMs,
          }
        : null,
      ideaCount: this.inbox.pendingCount(),
      ideas: this.options.feed?.() ?? [],
      activity: [...this.activity],
      notice: this.notice,
      mods: this.store.mods(),
      patches: this.store.mods(true),
      retirement: this.retirement(),
      usage: {
        ...this.store.usage(this.now()),
        cap: this.options.buildCap ?? 12,
      },
      now: this.now(),
    };
  }
  retirement(): { enabled: boolean; limit: number } {
    return {
      enabled: this.inbox.setting("retire-enabled") === "true",
      limit: Math.max(
        1,
        Math.min(24, Number(this.inbox.setting("retire-limit")) || 12),
      ),
    };
  }
  async setRetirement(enabled: boolean, limit: number): Promise<void> {
    if (this.building)
      throw Error("Wait for the current build before changing retirement");
    if (!Number.isInteger(limit) || limit < 1 || limit > 24)
      throw Error("Retirement limit must be 1..24");
    if (enabled && !this.options.simulation.retire)
      throw Error("Retirement is unavailable");
    if (enabled && !this.options.simulation.restore)
      throw Error("Retirement recovery is unavailable");
    this.inbox.setSetting("retire-enabled", String(enabled));
    this.inbox.setSetting("retire-limit", String(limit));
    await this.enforceRetirement();
    this.publish();
  }
  private async enforceRetirement(): Promise<void> {
    const { enabled, limit } = this.retirement();
    if (!enabled) return;
    while (this.store.mods().length > limit) {
      const oldest = this.store.mods()[0]!;
      const before = await this.options.simulation.checkpoint();
      const checkpoint = await this.options.simulation.retire!(oldest.id);
      try {
        this.store.retireAndCheckpoint(oldest.id, checkpoint);
      } catch (error) {
        await this.options.simulation.restore!(before);
        throw error;
      }
      this.options.announce(
        `Retired ${oldest.title}; its credits remain in the Hall of Patches.`,
      );
      this.line(`Retired ${oldest.title}; the patch remains in history`);
    }
  }
  publish(): void {
    this.options.broadcast(this.view());
  }
  private stage(
    round: ForgeRound,
    next: ForgeStage,
    deadline: number | null = null,
  ): void {
    if (!transitions[round.stage].includes(next))
      throw Error(`Invalid forge transition ${round.stage} -> ${next}`);
    round.stage = next;
    round.deadline = deadline;
    this.store.save(round, this.now());
    this.publish();
  }
  private line = (text: string): void => {
    this.activity.push(sanitize(text, 180));
    if (this.activity.length > 40) this.activity.shift();
    this.publish();
  };
  start(preset: "demo" | "normal"): void {
    if (this.running) return;
    this.preset = preset;
    this.running = true;
    this.inbox.setSetting("safe-mode", "false");
    if (
      this.previousBuild &&
      this.build &&
      ["FAILED", "ROLLED_BACK"].includes(this.build.stage)
    )
      this.stage(this.build, "IDLE");
    if (
      (!this.round && this.build?.stage !== "SHOWCASE") ||
      (this.round &&
        ["FAILED", "IDLE", "LIVE", "ROLLED_BACK"].includes(this.round.stage))
    )
      this.collect();
    this.timer ??= setInterval(() => this.pulse(), 250);
    this.publish();
  }
  private collect(): void {
    this.forcedWinner = undefined;
    this.acknowledgedIdeas.clear();
    this.round = this.store.createRound(this.now());
    this.options.resetRound();
    this.stage(
      this.round,
      "COLLECTING",
      this.now() + presets[this.preset].collect,
    );
    if (this.lastOpenRound !== this.round.id) {
      this.lastOpenRound = this.round.id;
      this.options.announce(
        "Forge open! !idea <a creature, spell or game twist>",
        `round:${this.round.id}:open`,
      );
    }
  }
  acknowledgeIdea(idea: Idea, roundId: number | undefined): void {
    if (
      idea.source !== "twitch" ||
      !this.running ||
      !this.round ||
      this.round.id !== roundId ||
      !["COLLECTING", "CURATING"].includes(this.round.stage) ||
      this.acknowledgedIdeas.has(idea.id)
    )
      return;
    this.acknowledgedIdeas.add(idea.id);
    this.options.announce(
      `${formatCredits([{ name: idea.author, source: "twitch" }])} your idea is in the forge!`,
      `round:${this.round.id}:idea:${idea.id}`,
    );
  }
  pulse(): void {
    if (!this.running) return;
    if (this.build?.stage === "SHOWCASE") {
      const round = this.build;
      const age = this.now() - this.showcaseAt;
      if (age >= 4000 && !this.showcaseFired) {
        this.showcaseFired = true;
        this.showcasePending = true;
        const action = this.showcaseAction;
        const label = action?.command ?? action?.event ?? "the new feature";
        this.notice = `▶ ${label} — try it yourself`;
        this.options.announce(`${this.notice}`);
        this.publish();
        this.track(
          (
            this.options.simulation.showcase?.(
              round.modId!,
              action?.command,
              action?.event,
            ) ?? Promise.resolve()
          )
            .catch(() =>
              this.line("Showcase could not be triggered; patch remains live"),
            )
            .finally(() => {
              this.showcasePending = false;
            }),
        );
      }
      if (
        age >= Math.max(5000, this.options.showcaseMs ?? 14000) &&
        this.showcaseFired &&
        !this.showcasePending
      ) {
        this.stage(round, "LIVE");
        if (this.activeBuildId !== undefined)
          this.store.saveBuild(this.activeBuildId, round);
        this.activeBuildId = undefined;
        this.finishedAt = this.now();
      }
      return;
    }
    if (
      this.build &&
      ["LIVE", "FAILED", "ROLLED_BACK"].includes(this.build.stage) &&
      this.finishedAt &&
      this.now() - this.finishedAt >= 5000
    )
      this.stage(this.build, "IDLE");
    const round = this.round;
    if (!round) {
      if (!this.building && this.options.autoCollect !== false) this.collect();
      return;
    }
    if (
      round.stage === "COLLECTING" &&
      this.now() >= round.deadline! &&
      !this.curating &&
      !this.building
    )
      this.track(this.curate(round));
    else if (round.stage === "VOTING" && this.now() >= round.deadline!) {
      round.winner =
        this.forcedWinner ?? round.tallies.indexOf(Math.max(...round.tallies));
      this.forcedWinner = undefined;
      for (const [index, card] of round.cards.entries())
        for (const [n, id] of (card.ideaIds ?? []).entries())
          this.inbox.mark(
            id,
            index === round.winner
              ? n === 0
                ? "used"
                : "merged"
              : "not chosen",
          );
      const delay = presets[this.preset].approval;
      this.stage(
        round,
        "STREAMER_APPROVAL",
        delay === null ? null : this.now() + delay,
      );
      this.options.announce(
        `Winner: ${round.cards[round.winner]!.title}. Awaiting streamer approval.`,
      );
    } else if (
      round.stage === "STREAMER_APPROVAL" &&
      round.deadline !== null &&
      this.now() >= round.deadline &&
      !this.building
    )
      this.approve();
    this.publish();
  }
  private async curate(round: ForgeRound): Promise<void> {
    this.curating = true;
    this.curationAbort = new AbortController();
    this.stage(round, "CURATING");
    let ideas = this.inbox.pending();
    try {
      const live = [
        ...Object.keys((await this.options.simulation.checkpoint()).world.mods),
        ...this.store.summaries(),
      ];
      const signal = AbortSignal.any([
        this.curationAbort.signal,
        AbortSignal.timeout(90000),
      ]);
      let result;
      for (let attempt = 0; ; attempt++) {
        round.ideaIds = ideas.map((idea) => idea.id);
        result = await this.options.producer.curate(ideas, live, signal);
        this.store.addTokens(result.tokens);
        signal.throwIfAborted();
        const next = this.inbox.pending();
        const seen = new Set(ideas.map((idea) => idea.id));
        if (
          !next.some((idea) => idea.source === "twitch" && !seen.has(idea.id))
        )
          break;
        if (attempt >= 2)
          throw Error(
            "New Twitch ideas arrived repeatedly during curation; retry the round",
          );
        ideas = next;
      }
      this.curationAbort.signal.throwIfAborted();
      for (const idea of ideas) {
        this.inbox.mark(
          idea.id,
          result.rejected.includes(idea.id)
            ? "rejected"
            : result.cards.some((c) => c.ideaIds?.includes(idea.id))
              ? "accepted"
              : "not chosen",
          result.rejected.includes(idea.id)
            ? "Moderation: the forge only shapes a safe game world"
            : "",
        );
      }
      if (
        ideas.some(
          (idea) =>
            idea.source === "twitch" && result.rejected.includes(idea.id),
        )
      )
        this.options.announce(worldOnlyReason);
      round.cards = result.cards;
      this.stage(round, "VOTING", this.now() + presets[this.preset].vote);
      for (const [index, card] of round.cards.entries()) {
        for (const credit of card.credits.filter(
          (entry) => entry.source === "twitch",
        ))
          this.options.announce(
            `${formatCredits([credit])} your idea is card ${index + 1} — !vote ${index + 1}`,
            `round:${round.id}:card:${index}:viewer:${credit.id ?? credit.name}`,
          );
      }
      for (const [i, card] of round.cards.entries())
        this.options.announce(
          `${i + 1}. ${card.title}: ${card.pitch}${card.suggestion ? " [Forge suggestion]" : ""}`,
        );
      this.options.announce(
        "Voting open! !vote 1, !vote 2 or !vote 3. Your last vote counts.",
      );
    } catch (error) {
      this.fail(round, error, "Producer unavailable; check connection");
    } finally {
      this.curating = false;
    }
  }
  vote(chat: Pick<Chat, "source" | "userId">, choice: number): boolean {
    if (
      !this.running ||
      this.round?.stage !== "VOTING" ||
      this.now() >= this.round.deadline! ||
      ![1, 2, 3].includes(choice)
    )
      return false;
    this.round.tallies = this.store.vote(
      this.round.id,
      `${chat.source}:${chat.userId}`,
      choice,
    );
    this.store.save(this.round, this.now(), false);
    this.publish();
    return true;
  }
  skipCountdown(): void {
    if (
      !this.running ||
      !this.round ||
      !["COLLECTING", "VOTING", "STREAMER_APPROVAL"].includes(
        this.round.stage,
      ) ||
      this.round.deadline === null
    )
      throw Error("No active countdown");
    this.round.deadline = this.now();
    this.store.save(this.round, this.now(), false);
    this.pulse();
  }
  forceWinner(choice: number): void {
    if (
      !this.running ||
      this.round?.stage !== "VOTING" ||
      !Number.isInteger(choice) ||
      choice < 1 ||
      choice > this.round.cards.length
    )
      throw Error("Choose a card during voting");
    this.forcedWinner = choice - 1;
    this.notice = `Director selected card ${choice} for this take`;
    this.publish();
  }
  async replayShowcase(): Promise<void> {
    if (this.building || this.build?.stage === "SHOWCASE")
      throw Error("Wait for the active build or showcase");
    const mod = this.store.mods().at(-1);
    if (!mod || !this.options.simulation.showcase)
      throw Error("No active showcase to replay");
    const row = this.inbox.db
      .prepare("SELECT source FROM mod_versions WHERE id=? AND active=1")
      .get(mod.id);
    if (typeof row?.source !== "string") throw Error("Showcase source missing");
    const test = inspectMod(row.source);
    const command = test.commands?.[0],
      event = command ? undefined : test.events?.[0];
    await this.options.simulation.showcase(mod.id, command, event);
    this.notice = `SIM replay: ${command ?? event ?? "feature"}`;
    this.publish();
  }
  approve(): void {
    const round = this.round;
    if (!this.running || round?.stage !== "STREAMER_APPROVAL" || this.building)
      throw Error("No approved build slot available");
    if (
      this.store.usage(this.now()).buildsThisHour >=
      (this.options.buildCap ?? 12)
    ) {
      this.notice = "Hourly build cap reached";
      round.deadline = null;
      this.store.save(round, this.now(), false);
      this.publish();
      return;
    }
    this.build = round;
    this.code = undefined;
    this.previousBuild = false;
    this.round = null;
    this.building = true;
    this.track(this.buildRound(round));
  }
  veto(): void {
    if (!this.round || this.round.stage !== "STREAMER_APPROVAL")
      throw Error("No card awaiting approval");
    this.fail(this.round, Error("Streamer veto"), "Card vetoed");
    if (this.running) this.collect();
  }
  cancel(): void {
    this.buildAbort?.abort();
    this.notice = "Build cancellation requested";
    this.publish();
  }
  stop(): void {
    this.running = false;
    clearInterval(this.timer);
    this.timer = undefined;
    this.curationAbort?.abort();
    this.buildAbort?.abort();
    if (
      this.round &&
      ["COLLECTING", "VOTING", "STREAMER_APPROVAL"].includes(this.round.stage)
    )
      this.stage(this.round, "FAILED");
    this.notice = "Forge stopped";
    this.publish();
  }
  private fail(round: ForgeRound, error: unknown, label: string): void {
    this.options.diagnostic?.(error);
    if (!["FAILED", "ROLLED_BACK", "IDLE"].includes(round.stage))
      this.stage(round, "FAILED");
    // Only locally authored diagnostics, never raw provider payloads, enter the HUD.
    this.notice = label;
    this.options.announce(`${label}. The game stays safe.`);
    this.line(
      error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
        ? "Work cancelled or timed out; last good game stays live"
        : `${label}; last good game stays live. Check model/login and Gatekeeper report.`,
    );
  }
  private async buildRound(round: ForgeRound): Promise<void> {
    const started = this.now(),
      buildId = this.store.beginBuild(round.id, started);
    this.activeBuildId = buildId;
    this.buildStartedAt = started;
    this.finishedAt = 0;
    this.buildAbort = new AbortController();
    const signal = AbortSignal.any([
      this.buildAbort.signal,
      AbortSignal.timeout(this.options.buildTimeoutMs ?? 240000),
    ]);
    round.modId = `forge-${this.store.season}-${round.id}`;
    this.stage(round, "BUILDING");
    let deployed = false;
    try {
      const card = round.cards[round.winner!]!;
      let source = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const checkpoint = await this.options.simulation.checkpoint();
        const baseline = await this.options.gate(
          {
            modId: round.modId,
            source: "",
            checkpoint: checkpoint.world,
            commands: [],
            baselineOnly: true,
          },
          signal,
        );
        if (!baseline.ok) {
          round.report = baseline;
          this.line(
            `HOST BASELINE ERROR: ${baseline.checks.find((c) => !c.ok)?.detail ?? "invalid world"}`,
          );
          throw Error("Host baseline invalid; Builder was not called");
        }
        round.attempts = attempt;
        this.store.saveBuild(buildId, round);
        const result = await this.options.builder.build({
          modId: round.modId,
          card,
          checkpoint: checkpoint.world,
          ...(round.report ? { report: round.report } : {}),
          signal,
          activity: this.line,
          code: (value) => {
            this.code = value;
            this.publish();
          },
        });
        source = result.source;
        this.store.addTokens(result.tokens);
        signal.throwIfAborted();
        round.report = {
          ok: false,
          checks: [],
          hashes: [],
          ticks: 0,
          durationMs: 0,
          effects: 0,
        };
        this.stage(round, "TESTING");
        // Exact admission parity: the Builder CLI and host use this immutable snapshot.
        round.report = await this.options.gate(
          {
            modId: round.modId,
            source,
            checkpoint: checkpoint.world,
            commands: card.commands,
            credits: card.credits,
            spectacle: true,
          },
          signal,
          (check) => {
            round.report!.checks.push(check);
            this.publish();
          },
        );
        round.durationMs = this.now() - started;
        this.store.saveBuild(buildId, round);
        this.store.save(round, this.now(), false);
        this.line(
          `Gatekeeper: ${round.report.ok ? "PASS" : "FAIL"}; attempt ${attempt}; ${round.report.ticks} ticks`,
        );
        if (round.report.ok) break;
        if (attempt < 3) this.stage(round, "BUILDING");
      }
      if (!round.report?.ok)
        throw Error("Gatekeeper rejected candidate after three attempts");
      signal.throwIfAborted();
      this.stage(round, "DEPLOYING");
      await this.options.simulation.deploy(round.modId, source);
      deployed = true;
      signal.throwIfAborted();
      const live = await this.options.simulation.checkpoint();
      signal.throwIfAborted();
      this.finishedAt = this.now();
      if (!transitions[round.stage].includes("SHOWCASE"))
        throw Error("Invalid deployment transition");
      this.store.commitLive(round, source, live, this.now(), buildId);
      const contract = inspectMod(source);
      this.showcaseAction = {
        command: contract.commands?.[0],
        event: contract.commands?.length ? undefined : contract.events?.[0],
      };
      this.showcaseFired = false;
      this.showcasePending = false;
      this.showcaseAt = this.now();
      this.publish();
      try {
        await this.enforceRetirement();
      } catch {
        this.line(
          "Retirement failed; the live patch remains active. Check retention settings.",
        );
      }
      const credits = formatCredits(card.credits);
      this.notice = `Shipped: ${card.title} - ${credits}`;
      await this.options.simulation
        .celebrate(this.notice)
        .catch(() => this.line("Mod is live; celebration display unavailable"));
      this.options.announce(
        `${this.notice}${card.commands.length ? `. Try ${card.commands.join(" ")}` : ""}`,
      );
      this.publish();
    } catch (error) {
      if (deployed && round.stage !== "LIVE" && round.stage !== "SHOWCASE") {
        const current = await this.options.simulation.checkpoint();
        this.acceptCheckpoint(
          current.world.mods[round.modId]
            ? await this.options.simulation.rollback(round.modId)
            : current,
        );
      }
      this.fail(
        round,
        error,
        signal.aborted ? "Build cancelled or timed out" : "Build failed",
      );
    } finally {
      round.durationMs = this.now() - started;
      this.finishedAt = this.now();
      this.store.saveBuild(buildId, round);
      this.store.save(round, this.now(), false);
      this.building = false;
      if (round.stage !== "SHOWCASE") this.activeBuildId = undefined;
      this.publish();
    }
  }
  async rollback(id?: string): Promise<void> {
    this.cancel();
    this.acceptCheckpoint(await this.options.simulation.rollback(id), true);
  }
  async safeMode(): Promise<void> {
    this.stop();
    this.acceptCheckpoint(await this.options.simulation.safeMode(), true);
    this.inbox.setSetting("safe-mode", "true");
    this.notice = "SAFE MODE: generated mods disabled";
    this.publish();
  }
  acceptCheckpoint(checkpoint: HostCheckpoint, rollback = false): void {
    this.store.checkpoint(checkpoint);
    this.store.reconcile(Object.keys(checkpoint.world.mods));
    if (rollback) {
      if (
        this.build &&
        ["SHOWCASE", "LIVE", "IDLE", "FAILED"].includes(this.build.stage)
      ) {
        this.build.stage = "ROLLED_BACK";
        this.finishedAt = this.now();
        this.store.save(this.build, this.now());
      }
      this.notice = "ROLLED BACK - restored previous game checkpoint";
    }
    this.publish();
  }
  async settled(): Promise<void> {
    await Promise.all([...this.tasks]);
  }
  async close(): Promise<void> {
    this.stop();
    await this.settled();
  }
}
