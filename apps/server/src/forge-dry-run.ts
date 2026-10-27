import { loadEnvironment } from "./environment.js";
import { resolve } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { World } from "../../../packages/engine/src/index.js";
import { CrowdSim } from "./crowd-sim.js";
import { IdeaInbox } from "./chat-router.js";
import { ForgeLoop } from "./forge-loop.js";
import { ForgeStore } from "./forge-store.js";
import { ModHost } from "./mod-host.js";
import { openAIProducer } from "./producer.js";
import { WorkspaceBuilder } from "./builder.js";
import { gatekeeper } from "./gatekeeper.js";
import type { ForgeView } from "../../../packages/shared/src/forge.js";

const root = resolve(process.cwd(), "../..");
loadEnvironment(resolve(root, ".env"));
const choice = Number(process.argv[2] ?? 1);
if (![1, 2, 3].includes(choice)) throw Error("Choose winning card 1, 2 or 3");
await mkdir(resolve(root, "runtime"), { recursive: true });
const inbox = new IdeaInbox(resolve(root, "runtime/forge-dry-run.sqlite"));
const store = new ForgeStore(inbox.db);
const previousRound = Math.max(0, ...store.latestRounds().map((r) => r.id));
const host = new ModHost(new World(2026));
const timeline: { stage: string; seconds: number }[] = [];
const start = performance.now();
let offset = 0;
const clock = () => Date.now() + offset;
const seenStages = new Map<number, string>();
let final: ForgeView | undefined;
const loop = new ForgeLoop(inbox, {
  autoCollect: false,
  producer: openAIProducer(process.env),
  builder: new WorkspaceBuilder(root, process.env, {
    get: () => store.threadId,
    set: (id) => {
      store.threadId = id;
    },
  }),
  simulation: {
    checkpoint: async () => host.exportCheckpoint(),
    deploy: (id, source) => host.load(id, source),
    rollback: async (id) => {
      host.rollback(id);
      return host.exportCheckpoint();
    },
    safeMode: async () => {
      host.safeMode();
      return host.exportCheckpoint();
    },
    celebrate: async () => {},
  },
  gate: async (input) => gatekeeper(input),
  now: clock,
  resetRound: () => {},
  announce: (text) => console.log(`BOT [SIM]: ${text}`),
  broadcast: (view) => {
    final = structuredClone(view);
    for (const round of [view.round, view.build])
      if (
        round &&
        round.id > previousRound &&
        seenStages.get(round.id) !== round.stage
      ) {
        seenStages.set(round.id, round.stage);
        const entry = {
          round: round.id,
          stage: round.stage,
          seconds: Number(((performance.now() - start) / 1000).toFixed(2)),
        };
        timeline.push(entry);
        console.log(JSON.stringify(entry));
      }
  },
  buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MS ?? 240000),
  diagnostic: (error) => {
    const info = error as { status?: number; code?: string; message?: string };
    let message = info.message ?? "Unknown failure";
    for (const key of [
      process.env.OPENAI_API_KEY,
      process.env.TWITCH_CLIENT_SECRET,
    ])
      if (key) message = message.replaceAll(key, "[redacted]");
    console.error(
      JSON.stringify({
        status: info.status,
        code: info.code,
        message: message.slice(0, 1600),
      }),
    );
  },
});
try {
  for (const id of ["meteor-shower", "slime-king", "aurora-blessing"])
    await host.load(
      id,
      await readFile(resolve(root, `apps/server/examples/${id}.js`), "utf8"),
    );
  host.markBaseline();
  const saved = store.checkpoint();
  if (saved) host.importCheckpoint(saved);
  // Only simulator input; this command never constructs Twitch auth or ChatOut.
  const receive = (
    event: import("../../../packages/shared/src/chat.js").SourceEvent,
  ) => {
    if (event.type === "chat" && event.text.startsWith("!idea "))
      inbox.add(event, event.text.slice(6), clock());
    if (event.type === "chat")
      host.world.joinViewer(
        `[SIM] ${event.displayName}`,
        `simulator:${event.userId}`,
        true,
      );
  };
  const sim = new CrowdSim(2026 + choice * 100, receive);
  for (let i = 0; i < 180; i++) receive(sim.next());
  loop.start("demo");
  offset += 45001;
  loop.pulse();
  await loop.settled();
  if (loop.round?.stage !== "VOTING")
    throw Error(
      "Real Producer failed before voting. Verify API key, credits and PRODUCER_MODEL.",
    );
  loop.vote({ source: "simulator", userId: "dry-run-voter" }, choice);
  offset += 30001;
  loop.pulse();
  if (String(loop.round.stage) !== "STREAMER_APPROVAL")
    throw Error("Voting failed");
  loop.approve();
  await loop.settled();
  if (loop.build?.stage !== "LIVE")
    throw Error("Real Builder/Gatekeeper did not reach LIVE");
  const round = loop.build,
    card = round.cards[round.winner!]!;
  const source = host.world.state.mods[round.modId!]!.source;
  const directory = resolve(root, "docs/media/sample-mods");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${round.modId}.js`), source, "utf8");
  await writeFile(
    resolve(directory, `${round.modId}.json`),
    JSON.stringify(
      {
        title: card.title,
        card,
        threadId: store.threadId,
        attempts: round.attempts,
        timeline,
        report: round.report,
        durationSeconds: (performance.now() - start) / 1000,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        result: "LIVE",
        title: card.title,
        modId: round.modId,
        threadId: store.threadId,
        attempts: round.attempts,
        report: round.report,
        timeline,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Dry run failed");
  console.error(
    JSON.stringify({
      timeline,
      activity: final?.activity,
      report: final?.build?.report,
    }),
  );
  process.exitCode = 1;
} finally {
  await loop.close();
  host.dispose();
  inbox.close();
}
