import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  sourceConfigSchema,
  type DashboardState,
  type SourceEvent,
} from "../../../packages/shared/src/chat.js";
import { TwitchAuth } from "./twitch-auth.js";
import { EventSub } from "./eventsub.js";
import { IdeaInbox, ChatRouter, sanitize } from "./chat-router.js";
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
  config: DashboardState["config"];
  private constructor(
    root: string,
    env: NodeJS.ProcessEnv,
    send: (payload: Record<string, unknown>) => Promise<unknown>,
  ) {
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
      file: resolve(root, "runtime/secrets/twitch.json"),
    });
    this.inbox = new IdeaInbox(resolve(root, "runtime/ideas.sqlite"));
    this.out = new ChatOut((message) =>
      this.auth.helix("chat/messages", {
        method: "POST",
        body: JSON.stringify({
          broadcaster_id: this.auth.userId,
          sender_id: this.auth.userId,
          message,
        }),
      }),
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
      command: (name, chat, args) =>
        command({
          type: "command",
          command: name,
          viewer:
            chat.source === "simulator"
              ? `[SIM] ${chat.displayName}`
              : chat.displayName,
          args,
        }),
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
        const viewer = `${event.source === "simulator" ? "[SIM] " : ""}${sanitize(event.viewer, 32)}`;
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
    this.sim = new CrowdSim(Number(env.SIM_SEED ?? 2026), receive);
  }
  static async create(
    root: string,
    env: NodeJS.ProcessEnv,
    send: (payload: Record<string, unknown>) => Promise<unknown>,
  ): Promise<Audience> {
    await mkdir(resolve(root, "runtime"), { recursive: true });
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
      ideas: this.inbox.ideas,
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
