import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  sourceConfigSchema,
  type DashboardState,
  type SourceEvent,
} from "../../../packages/shared/src/chat.js";
import { TwitchAuth } from "./twitch-auth.js";
import { EventSub } from "./eventsub.js";
import { formatCredit } from "../../../packages/shared/src/forge.js";
import {
  IdeaInbox,
  ChatRouter,
  sanitize,
  safeDisplayName,
} from "./chat-router.js";
import { ChatOut } from "./chat-out.js";
import { CrowdSim } from "./crowd-sim.js";

export class Audience {
  readonly auth: TwitchAuth;
  readonly eventsub: EventSub;
  readonly sim: CrowdSim;
  readonly inbox: IdeaInbox;
  readonly router: ChatRouter;
  readonly out: ChatOut;
  private timer?: NodeJS.Timeout;
  private log: DashboardState["log"] = [];
  private sequence = 0;
  private stopped = false;
  approveCommandArgs?: (text: string) => Promise<boolean>;
  private sendSimulation: (
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  config: DashboardState["config"];
  private constructor(
    root: string,
    env: NodeJS.ProcessEnv,
    send: (payload: Record<string, unknown>) => Promise<unknown>,
  ) {
    this.sendSimulation = send;
    this.config = sourceConfigSchema.parse({
      sources: (env.CHAT_SOURCE ?? "simulator").split(","),
      intensity: env.SIM_INTENSITY ?? "normal",
      autoJoin: env.CHAT_AUTO_JOIN !== "false",
    });
    this.auth = new TwitchAuth({
      clientId: env.TWITCH_CLIENT_ID ?? "",
      clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
      redirectUri:
        env.TWITCH_REDIRECT_URI ?? "http://localhost:3000/auth/twitch/callback",
      file: resolve(
        env.CHATFORGE_RUNTIME_DIR ?? resolve(root, "runtime"),
        "secrets/twitch.json",
      ),
    });
    this.inbox = new IdeaInbox(
      resolve(
        env.CHATFORGE_RUNTIME_DIR ?? resolve(root, "runtime"),
        "ideas.sqlite",
      ),
    );
    this.out = new ChatOut(
      (message) =>
        this.auth.helix("chat/messages", {
          method: "POST",
          body: JSON.stringify({
            broadcaster_id: this.auth.userId,
            sender_id: this.auth.userId,
            message,
          }),
        }),
      Date.now,
      (message, status) => this.record("Twitch out", `${status}: ${message}`),
    );
    const command = (payload: Record<string, unknown>) => {
      void send(payload).catch(() =>
        this.record("system", "Simulation command failed"),
      );
    };
    this.router = new ChatRouter(this.inbox, {
      join: (chat) =>
        command({
          type: "join",
          viewer: chat.displayName,
          userId: chat.userId,
          source: chat.source,
        }),
      command: (name, chat, args) => {
        void (async () => {
          if (args && !(await this.approveCommandArgs?.(args))) return;
          if (!this.stopped)
            command({
              type: "command",
              command: name,
              viewer: formatCredit({
                name: chat.displayName,
                source: chat.source,
              }),
              args,
            });
        })();
      },
      reply: (text, source) => {
        if (source === "simulator") this.record("SIM", `Local bot: ${text}`);
        else this.out.enqueue(text, source);
      },
    });
    const receive = (event: SourceEvent) => {
      if (!this.config.sources.includes(event.source)) return;
      const label = event.source === "simulator" ? "SIM" : "Twitch";
      if (event.type === "chat") {
        const result = this.router.route(event);
        this.record(
          label,
          `${sanitize(event.displayName, 32)}: ${sanitize(event.text)} · ${result}`,
        );
      } else {
        const viewer = formatCredit({
          name: safeDisplayName(event.viewer),
          source: event.source,
        });
        this.record(label, `${event.type} · ${viewer} · ${event.count}`);
        command({
          type: "event",
          event: event.type,
          viewer,
          userId: event.userId,
          source: event.source,
          count: event.count,
          detail: event.detail,
        });
      }
    };
    this.eventsub = new EventSub({
      userId: () => this.auth.userId,
      subscribe: (body) =>
        this.auth.helix("eventsub/subscriptions", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      receive,
      revoked: () => this.auth.disconnect(),
      claimMessage: (id, timestamp) => this.inbox.claimEvent(id, timestamp),
    });
    this.auth.onDisconnect = () => {
      this.eventsub.stop();
      this.out.clear();
    };
    this.sim = new CrowdSim(
      Number(this.inbox.setting("sim-rng") ?? env.SIM_SEED ?? 2026),
      receive,
      (state) => this.inbox.setSetting("sim-rng", String(state)),
    );
  }
  static async create(
    root: string,
    env: NodeJS.ProcessEnv,
    send: (payload: Record<string, unknown>) => Promise<unknown>,
  ): Promise<Audience> {
    await mkdir(env.CHATFORGE_RUNTIME_DIR ?? resolve(root, "runtime"), {
      recursive: true,
    });
    return new Audience(root, env, send);
  }
  private record(source: string, text: string): void {
    this.log.push({
      id: ++this.sequence,
      source,
      text: sanitize(text, 650),
      time: Date.now(),
    });
    if (this.log.length > 200) this.log.shift();
  }
  async start(): Promise<void> {
    await this.auth.start();
    if (this.stopped) {
      this.auth.stop();
      return;
    }
    this.configure(this.config);
    this.timer = setInterval(() => {
      if (this.config.sources.includes("twitch") && this.auth.ready)
        void this.out.tick();
    }, 200);
  }
  configure(value: unknown): void {
    this.config = sourceConfigSchema.parse(value);
    this.router.autoJoin = this.config.autoJoin;
    this.sim.setIntensity(this.config.intensity);
    if (this.config.sources.includes("simulator")) this.sim.start();
    else this.sim.stop();
    if (this.config.sources.includes("twitch") && this.auth.ready)
      this.eventsub.start();
    else {
      this.eventsub.stop();
      this.out.clear();
    }
  }
  status(): DashboardState {
    return {
      auth: this.auth.status(),
      eventsub: {
        state: this.eventsub.state,
        subscriptions: this.eventsub.statuses,
      },
      config: this.config,
      log: this.log,
      ideas: this.inbox.pendingPage(0),
      votes: [...this.router.votes.values()],
      outbound: this.out.status,
    };
  }
  testMessage(): boolean {
    return (
      this.auth.ready &&
      this.config.sources.includes("twitch") &&
      this.out.enqueue(
        "ChatForge connection test — the forge is ready!",
        "twitch",
      )
    );
  }
  announce(text: string): void {
    if (this.config.sources.includes("twitch") && this.auth.ready)
      this.out.enqueue(text, "twitch");
    else this.record("SIM", `Local forge: ${text}`);
  }
  async directorEvent(type: string): Promise<void> {
    if (
      !["twitch:sub", "twitch:raid", "twitch:cheer", "twitch:follow"].includes(
        type,
      )
    )
      throw Error("Invalid simulated event");
    this.record("SIM", `Director: ${type}`);
    await this.sendSimulation({
      type: "event",
      event: type,
      viewer: "@Director (SIM)",
      userId: "director",
      source: "simulator",
      count: 1,
      detail: "SIM director",
    });
  }
  stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
    this.sim.stop();
    this.eventsub.stop();
    this.auth.stop();
    this.out.clear();
    this.inbox.close();
  }
}
