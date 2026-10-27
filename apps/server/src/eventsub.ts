import { WebSocket } from "ws";
import { z } from "zod";
import {
  chatSchema,
  audienceEventSchema,
  type SourceEvent,
  type ChatSource,
} from "../../../packages/shared/src/chat.js";
import { sanitize } from "./chat-router.js";
import { TwitchError } from "./twitch-auth.js";

const envelope = z.object({
  metadata: z.object({
    message_id: z.string().min(1).max(200),
    message_type: z.string(),
    message_timestamp: z.string(),
  }),
  payload: z.object({
    session: z
      .object({
        id: z.string(),
        keepalive_timeout_seconds: z.number().nullable(),
        reconnect_url: z.string().nullable().optional(),
      })
      .optional(),
    subscription: z.object({ type: z.string(), status: z.string() }).optional(),
    event: z.record(z.string(), z.unknown()).optional(),
  }),
});
export const subscriptionTypes = [
  "channel.chat.message",
  "channel.follow",
  "channel.raid",
  "channel.subscribe",
  "channel.subscription.gift",
  "channel.subscription.message",
  "channel.cheer",
];
export function subscriptions(userId: string) {
  return subscriptionTypes.map((type) => ({
    type,
    version: type === "channel.follow" ? "2" : "1",
    condition:
      type === "channel.raid"
        ? { to_broadcaster_user_id: userId }
        : {
            broadcaster_user_id: userId,
            ...(type === "channel.follow"
              ? { moderator_user_id: userId }
              : type === "channel.chat.message"
                ? { user_id: userId }
                : {}),
          },
  }));
}
export function mapNotification(
  type: string,
  event: Record<string, unknown>,
): SourceEvent | undefined {
  if (type === "channel.chat.message") {
    const parsed = z
      .object({
        chatter_user_id: z.string(),
        chatter_user_login: z.string(),
        chatter_user_name: z.string(),
        broadcaster_user_id: z.string(),
        badges: z.array(z.object({ set_id: z.string() })),
        message: z.object({
          text: z.string(),
          fragments: z.array(z.object({ type: z.string(), text: z.string() })),
        }),
      })
      .safeParse(event);
    if (!parsed.success) return;
    const e = parsed.data;
    const meaningful = e.message.fragments.filter((f) => f.text.trim());
    // Ignore the command prefix when detecting an emote-only idea body.
    const textFragments = e.message.fragments
      .filter((f) => f.type === "text")
      .map((f) => f.text)
      .join("")
      .replace(/^\s*!idea\s*/i, "")
      .trim();
    return chatSchema.parse({
      type: "chat",
      source: "twitch",
      userId: e.chatter_user_id,
      login: sanitize(e.chatter_user_login, 100),
      displayName: sanitize(e.chatter_user_name, 32),
      text: sanitize(e.message.text),
      badges: e.badges.map((b) => b.set_id),
      isBroadcaster: e.chatter_user_id === e.broadcaster_user_id,
      isMod: e.badges.some((b) => b.set_id === "moderator"),
      emoteOnly:
        meaningful.length > 0 &&
        !textFragments &&
        meaningful.some((f) => f.type === "emote" || f.type === "cheermote"),
    });
  }
  const names: Record<string, string> = {
    "channel.subscribe": "twitch:sub",
    "channel.subscription.gift": "twitch:sub",
    "channel.subscription.message": "twitch:sub",
    "channel.cheer": "twitch:cheer",
    "channel.raid": "twitch:raid",
    "channel.follow": "twitch:follow",
  };
  if (!names[type]) return;
  const raid = type === "channel.raid";
  const result = audienceEventSchema.safeParse({
    type: names[type],
    source: "twitch",
    userId: String(
      event[raid ? "from_broadcaster_user_id" : "user_id"] ?? "anonymous",
    ),
    viewer: sanitize(
      String(
        event[raid ? "from_broadcaster_user_name" : "user_name"] ?? "Anonymous",
      ),
      32,
    ),
    count: Number(event.bits ?? event.viewers ?? event.total ?? 1),
    detail: type,
  });
  return result.success ? result.data : undefined;
}
interface EventSubOptions {
  userId: () => string;
  subscribe: (body: unknown) => Promise<unknown>;
  receive: (event: SourceEvent) => void;
  revoked: () => void;
  claimMessage?: (id: string, timestamp: number) => boolean;
  url?: string;
  backoffMs?: number;
}
export class EventSub implements ChatSource {
  state = "stopped";
  readonly statuses = subscriptionTypes.map((type) => ({
    type,
    version: type === "channel.follow" ? "2" : "1",
    status: "unavailable",
    reason: "not connected",
  }));
  private active?: WebSocket;
  private pending?: WebSocket;
  private sockets = new Set<WebSocket>();
  private seen = new Map<string, number>();
  private retry?: NodeJS.Timeout;
  private attempt = 0;
  private stopped = true;
  private generation = 0;
  constructor(private options: EventSubOptions) {}
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect(this.options.url ?? "wss://eventsub.wss.twitch.tv/ws", false);
  }
  stop(): void {
    this.generation++;
    this.stopped = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    this.active = undefined;
    this.pending = undefined;
    this.state = "stopped";
    for (const status of this.statuses) {
      if (status.status !== "unavailable") {
        status.status = "unavailable";
        status.reason = "disconnected";
      }
    }
  }
  private reconnect(transferUrl?: string): void {
    if (this.stopped || this.retry || this.pending) return;
    this.state = "reconnecting";
    this.retry = setTimeout(
      () => {
        this.retry = undefined;
        this.connect(
          transferUrl ?? this.options.url ?? "wss://eventsub.wss.twitch.tv/ws",
          !!transferUrl,
        );
      },
      Math.min(
        30000,
        (this.options.backoffMs ?? 1000) * 2 ** Math.min(this.attempt++, 5),
      ),
    );
  }
  private connect(url: string, transfer: boolean): void {
    if (this.stopped || this.pending) return;
    this.state = transfer ? "transferring" : "connecting";
    const generation = this.generation;
    const ws = new WebSocket(url, {
      handshakeTimeout: 10000,
      maxPayload: 128 * 1024,
    });
    this.pending = ws;
    this.sockets.add(ws);
    let welcomed = false;
    let timeoutMs = 10000;
    let watchdog: NodeJS.Timeout;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws.terminate(), timeoutMs + 1000);
    };
    arm();
    ws.on("error", () => {
      /* Close drives retry; never log transport payloads. */
    });
    ws.on("close", () => {
      clearTimeout(watchdog);
      this.sockets.delete(ws);
      if (generation !== this.generation) return;
      if (this.pending === ws) this.pending = undefined;
      if (this.active === ws) this.active = undefined;
      if (!this.active) this.reconnect();
      else if (transfer && !welcomed) this.reconnect(url);
    });
    ws.on("message", (bytes) => {
      if (this.stopped || generation !== this.generation) return;
      try {
        const parsed = envelope.safeParse(JSON.parse(bytes.toString()));
        if (!parsed.success) return;
        const { metadata: meta, payload } = parsed.data;
        if (
          meta.message_type === "session_welcome" &&
          payload.session &&
          !welcomed
        ) {
          welcomed = true;
          this.attempt = 0;
          const old = this.active;
          this.active = ws;
          this.pending = undefined;
          timeoutMs = Math.max(
            100,
            (payload.session.keepalive_timeout_seconds ?? 10) * 1000,
          );
          arm();
          this.state = "connected";
          if (old && old !== ws) old.close();
          if (!transfer) void this.subscribe(payload.session.id, ws);
          return;
        }
        if (!welcomed) return;
        if (["session_keepalive", "notification"].includes(meta.message_type))
          arm();
        if (
          meta.message_type === "session_reconnect" &&
          payload.session?.reconnect_url &&
          ws === this.active
        ) {
          const target = new URL(payload.session.reconnect_url);
          const base = new URL(
            this.options.url ?? "wss://eventsub.wss.twitch.tv/ws",
          );
          if (target.protocol === base.protocol && target.host === base.host)
            this.connect(target.toString(), true);
          return;
        }
        const now = Date.now();
        const timestamp = Date.parse(meta.message_timestamp);
        if (
          !Number.isFinite(timestamp) ||
          timestamp < now - 600000 ||
          timestamp > now + 60000
        )
          return;
        for (const [id, expiry] of this.seen)
          if (expiry < now) this.seen.delete(id);
        if (this.seen.has(meta.message_id) || this.seen.size >= 50000) return;
        if (
          this.options.claimMessage &&
          !this.options.claimMessage(meta.message_id, timestamp)
        )
          return;
        this.seen.set(meta.message_id, timestamp + 600000);
        if (meta.message_type === "revocation" && payload.subscription) {
          const status = this.statuses.find(
            (s) => s.type === payload.subscription!.type,
          );
          if (status) {
            status.status = "unavailable";
            status.reason = sanitize(payload.subscription.status, 100);
          }
          if (payload.subscription.status === "authorization_revoked")
            this.options.revoked();
        }
        if (
          meta.message_type === "notification" &&
          payload.subscription &&
          payload.event
        ) {
          const event = mapNotification(
            payload.subscription.type,
            payload.event,
          );
          if (event) this.options.receive(event);
        }
      } catch {
        /* Malformed untrusted payloads cannot terminate the client. */
      }
    });
  }
  private async subscribe(sessionId: string, ws: WebSocket): Promise<void> {
    // Start all requests immediately, including chat, inside Twitch's 10-second welcome window.
    await Promise.all(
      subscriptions(this.options.userId()).map(async (body) => {
        const status = this.statuses.find((s) => s.type === body.type)!;
        status.status = "pending";
        status.reason = "";
        try {
          const response = await this.options.subscribe({
            ...body,
            transport: { method: "websocket", session_id: sessionId },
          });
          const accepted = z
            .object({
              data: z.array(z.object({ status: z.literal("enabled") })).min(1),
            })
            .safeParse(response);
          if (!accepted.success)
            throw new Error("Subscription was not enabled");
          if (this.active === ws && status.status === "pending")
            status.status = "enabled";
        } catch (error) {
          if (this.active !== ws) return;
          status.status = "unavailable";
          status.reason =
            error instanceof TwitchError
              ? `HTTP ${error.status}: check permission / channel eligibility`
              : "Connection or authorization failed";
        }
      }),
    );
  }
}
