import { z } from "zod";
import type { Source } from "../../../packages/shared/src/chat.js";
import { sanitize } from "./chat-router.js";
import { TwitchError } from "./twitch-auth.js";

export class ChatOut {
  private queue: string[] = [];
  private seen = new Map<string, number>();
  private eventKeys = new Set<string>();
  private next = 0;
  private busy = false;
  status = "idle";
  constructor(
    private send: (message: string) => Promise<unknown>,
    private now = Date.now,
    private delivered: (message: string, status: string) => void = () => {},
  ) {}
  enqueue(text: string, source: Source, eventKey?: string): boolean {
    if (source !== "twitch") return false;
    // ASCII escape preserves U+2692 through editors/shells with legacy code pages.
    const message = `\u2692 ${sanitize(text, 498)}`;
    const now = this.now();
    for (const [key, expiry] of this.seen)
      if (expiry <= now) this.seen.delete(key);
    if (
      (eventKey ? this.eventKeys.has(eventKey) : this.seen.has(message)) ||
      this.queue.length >= 20
    )
      return false;
    if (eventKey) {
      this.eventKeys.add(eventKey);
      while (this.eventKeys.size > 500)
        this.eventKeys.delete(this.eventKeys.values().next().value!);
    } else this.seen.set(message, now + 60000);
    this.queue.push(message);
    this.status = `queued (${this.queue.length})`;
    return true;
  }
  clear(): void {
    this.queue = [];
    this.status = "idle";
  }
  async tick(): Promise<void> {
    if (this.busy || this.now() < this.next || !this.queue.length) return;
    const message = this.queue.shift()!;
    this.busy = true;
    this.next = this.now() + 1600; // <20 messages / 30 seconds; one channel.
    try {
      const data = z
        .object({ data: z.array(z.object({ is_sent: z.boolean() })).min(1) })
        .parse(await this.send(message));
      this.status = data.data[0]!.is_sent ? "sent" : "Twitch dropped message";
      this.delivered(message, this.status);
    } catch (error) {
      if (error instanceof TwitchError && error.status === 429) {
        this.next = this.now() + error.retryAfter;
        this.queue.unshift(message);
        this.status = "rate limited; waiting";
      } else this.status = "send failed; check Twitch connection";
    } finally {
      this.busy = false;
    }
  }
}
