import OpenAI from "openai";
import type { Idea } from "../../../packages/shared/src/chat.js";
import { allowedIdea } from "./producer.js";
import { safeDisplayName } from "./chat-router.js";
import { moderateIdeas } from "./moderation-policy.js";

type Visible = { author: string; text: string; source: string };

/** The overlay never sees pending input. Provider errors fail closed. */
export class FeedModeration {
  private queue: Idea[] = [];
  private visible: Visible[] = [];
  private cache = new Map<string, boolean>();
  private timer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private stopped = false;
  private controller = new AbortController();
  constructor(
    private moderate: (
      texts: string[],
      signal: AbortSignal,
    ) => Promise<boolean[]>,
    private changed: () => void = () => {},
  ) {}
  add(idea: Idea): void {
    if (this.stopped || !allowedIdea(idea.text)) return;
    if (this.queue.length >= 200) return;
    this.queue.push(idea);
    this.schedule();
  }
  private schedule(): void {
    if (!this.stopped && !this.busy && !this.timer && this.queue.length)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 400);
  }
  async flush(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    const batch = this.queue.splice(0, 30);
    try {
      const missing = [
        ...new Set(batch.map((i) => i.text).filter((s) => !this.cache.has(s))),
      ];
      if (missing.length) {
        const flags = await this.moderate(
          missing,
          AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
        );
        if (
          flags.length !== missing.length ||
          flags.some((f) => typeof f !== "boolean")
        )
          throw Error("Invalid moderation result");
        missing.forEach((s, i) => this.cache.set(s, flags[i]!));
        while (this.cache.size > 500)
          this.cache.delete(this.cache.keys().next().value!);
      }
      if (this.stopped) return;
      for (const idea of batch)
        if (this.cache.get(idea.text) === false) {
          this.visible.push({
            author: safeDisplayName(idea.author),
            text: idea.text,
            source: idea.source,
          });
          if (this.visible.length > 3) this.visible.shift();
        }
      this.changed();
    } catch {
      // No unverified text is exposed or cached on transport failure.
      this.visible = [];
      if (!this.stopped) this.changed();
    } finally {
      this.busy = false;
      this.schedule();
    }
  }
  items(): Visible[] {
    return this.visible.slice().reverse();
  }
  async approveText(text: string): Promise<boolean> {
    if (this.stopped || !allowedIdea(text)) return false;
    const cached = this.cache.get(text);
    if (cached !== undefined) return !cached;
    try {
      const flags = await this.moderate(
        [text],
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
      );
      if (flags.length !== 1 || typeof flags[0] !== "boolean" || this.stopped) {
        this.visible = [];
        if (!this.stopped) this.changed();
        return false;
      }
      this.cache.set(text, flags[0]);
      while (this.cache.size > 500)
        this.cache.delete(this.cache.keys().next().value!);
      return !flags[0];
    } catch {
      this.visible = [];
      if (!this.stopped) this.changed();
      return false;
    }
  }
  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller.abort();
    this.queue = [];
  }
}

export function openAIFeedModeration(
  env: NodeJS.ProcessEnv,
  changed: () => void,
): FeedModeration {
  const client = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 10000 })
    : undefined;
  return new FeedModeration(async (input, signal) => {
    if (!client) throw Error("Moderation unavailable");
    return moderateIdeas(client, input, signal);
  }, changed);
}
