import { DatabaseSync } from "node:sqlite";
import {
  ideaSchema,
  type Chat,
  type Idea,
  type Source,
} from "../../../packages/shared/src/chat.js";

export function sanitize(value: string, max = 500): string {
  return Array.from(
    value
      .normalize("NFC")
      .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (/\s/u.test(c) ? " " : ""))
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, max)
    .join("");
}
export function hasLink(text: string): boolean {
  return /(?:https?:|www\.|discord\s*\.?\s*gg|[\p{L}\d-]+(?:\.[a-z]{2,}|\s*\[dot\]\s*[a-z]{2,})(?:\b|\/))/iu.test(
    text,
  );
}
export const ideaKey = (text: string): string =>
  sanitize(text, 240).toLocaleLowerCase("en-US");
export class IdeaInbox {
  readonly db: DatabaseSync;
  readonly ideas: Idea[];
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY, author TEXT NOT NULL, userId TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL, source TEXT NOT NULL)",
    );
    if (
      !this.db
        .prepare("PRAGMA table_info(ideas)")
        .all()
        .some((c) => c.name === "normalized")
    )
      this.db.exec(
        "ALTER TABLE ideas ADD COLUMN normalized TEXT NOT NULL DEFAULT ''",
      );
    // Migrate old pending duplicates without deleting the historical records.
    const pending = new Set<string>();
    for (const row of this.db
      .prepare("SELECT * FROM ideas ORDER BY id")
      .all()) {
      const normalized = ideaKey(String(row.text));
      const key = `${String(row.source)}:${String(row.userId)}:${normalized}`;
      const status =
        row.status === "pending" && pending.has(key)
          ? "rejected"
          : String(row.status);
      if (status === "pending") pending.add(key);
      this.db
        .prepare("UPDATE ideas SET normalized=?,status=? WHERE id=?")
        .run(normalized, status, row.id!);
    }
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS ideas_pending_unique ON ideas(source,userId,normalized) WHERE status='pending'; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS event_receipts (id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS event_receipts_expiry ON event_receipts(expiresAt)",
    );
    this.ideas = this.db
      .prepare("SELECT * FROM ideas ORDER BY id DESC LIMIT 500")
      .all()
      .reverse()
      .map((row) => ideaSchema.parse(row));
  }
  setting(key: string): string | undefined {
    return this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)
      ?.value as string | undefined;
  }
  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  hasPending(chat: Pick<Chat, "source" | "userId">, text: string): boolean {
    return !!this.db
      .prepare(
        "SELECT 1 FROM ideas WHERE source=? AND userId=? AND normalized=? AND status='pending'",
      )
      .get(chat.source, chat.userId, ideaKey(text));
  }
  pending(limit = 200): Idea[] {
    return this.db
      .prepare("SELECT * FROM ideas WHERE status='pending' ORDER BY id LIMIT ?")
      .all(limit)
      .map((row) => ideaSchema.parse(row));
  }
  pendingCount(): number {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM ideas WHERE status='pending'")
        .get()?.count ?? 0,
    );
  }
  mark(id: number, status: Idea["status"]): void {
    this.db.prepare("UPDATE ideas SET status=? WHERE id=?").run(status, id);
    const cached = this.ideas.find((idea) => idea.id === id);
    if (cached) cached.status = status;
  }
  private lastPrune = 0;
  claimEvent(id: string, timestamp: number, now = Date.now()): boolean {
    if (timestamp < now - 600000 || timestamp > now + 60000) return false;
    if (now - this.lastPrune > 60000) {
      this.db
        .prepare("DELETE FROM event_receipts WHERE expiresAt < ?")
        .run(now);
      this.lastPrune = now;
    }
    return (
      this.db
        .prepare(
          "INSERT OR IGNORE INTO event_receipts(id,expiresAt) VALUES(?,?)",
        )
        .run(id, timestamp + 600000).changes === 1
    );
  }
  add(chat: Chat, text: string, now: number): Idea | undefined {
    const info = this.db
      .prepare(
        "INSERT OR IGNORE INTO ideas(author,userId,text,status,createdAt,source,normalized) VALUES(?,?,?,'pending',?,?,?)",
      )
      .run(
        chat.displayName,
        chat.userId,
        text,
        now,
        chat.source,
        ideaKey(text),
      );
    if (!info.changes) return;
    const idea: Idea = {
      id: Number(info.lastInsertRowid),
      author: chat.displayName,
      userId: chat.userId,
      text,
      status: "pending",
      createdAt: now,
      source: chat.source,
    };
    this.ideas.push(idea);
    if (this.ideas.length > 500) this.ideas.shift();
    return idea;
  }
  close(): void {
    this.db.close();
  }
}
interface RouterHooks {
  join(chat: Chat): void;
  command(name: string, chat: Chat, args: string): void;
  reply(text: string, source: Source): void;
}
export class ChatRouter {
  autoJoin = true;
  onVote?: (chat: Chat, choice: number) => boolean;
  forgeStatus?: () => string;
  private cooldowns = new Map<string, number>();
  private duplicates = new Set<string>();
  private count = 0;
  readonly votes = new Map<
    string,
    { userId: string; choice: number; source: Source }
  >();
  constructor(
    readonly inbox: IdeaInbox,
    private hooks: RouterHooks,
    private now = Date.now,
  ) {}
  /** M3 calls this at round start; M2 has one collection round per process. */
  resetRound(): void {
    this.count = 0;
    this.duplicates.clear();
    this.votes.clear();
  }
  private allowed(chat: Chat, kind: string, ms: number): boolean {
    const now = this.now();
    for (const [key, expiry] of this.cooldowns)
      if (expiry <= now) this.cooldowns.delete(key);
    const key = `${chat.source}:${chat.userId}:${kind}`;
    if (this.cooldowns.has(key) || this.cooldowns.size >= 10000) return false;
    this.cooldowns.set(key, now + ms);
    return true;
  }
  route(raw: Chat): string {
    const chat = {
      ...raw,
      displayName:
        sanitize(raw.displayName, 32) || sanitize(raw.login, 32) || "Viewer",
      text: sanitize(raw.text),
    };
    const [command = "", ...rest] = chat.text.split(" ");
    const name = command.toLowerCase();
    const args = rest.join(" ");
    if ((this.autoJoin || name === "!join") && this.allowed(chat, "join", 5000))
      this.hooks.join(chat);
    if (name === "!idea") {
      if (chat.emoteOnly || !/[\p{L}\p{N}]/u.test(args))
        return "idea ignored: emote-only or empty";
      if (hasLink(args)) return "idea rejected: links";
      const text = sanitize(args, 240);
      const key = `${chat.source}:${chat.userId}:${text.toLocaleLowerCase("en-US")}`;
      if (this.duplicates.has(key) || this.inbox.hasPending(chat, text))
        return "idea ignored: duplicate";
      if (this.count >= 200) return "idea rejected: round full";
      if (!this.allowed(chat, "idea", 10000)) return "idea ignored: cooldown";
      this.inbox.add(chat, text, this.now());
      this.duplicates.add(key);
      this.count++;
      return "idea queued";
    }
    if (name === "!vote") {
      if (!/^[123]$/.test(args)) return "vote ignored: choose 1, 2 or 3";
      if (!this.allowed(chat, "vote", 2000)) return "vote ignored: cooldown";
      if (this.onVote && !this.onVote(chat, Number(args)))
        return "vote ignored: voting is closed";
      this.votes.set(`${chat.source}:${chat.userId}`, {
        userId: chat.userId,
        choice: Number(args),
        source: chat.source,
      });
      return "vote recorded";
    }
    if (
      (name === "!help" || name === "!forge") &&
      this.allowed(chat, "reply", 30000)
    ) {
      this.hooks.reply(
        name === "!help"
          ? "ChatForge: !join, !idea <feature>, !vote 1|2|3, !forge. Mods: !meteor."
          : (this.forgeStatus?.() ??
              "ChatForge: waiting for the next forge round."),
        chat.source,
      );
    } else if (
      /^![a-z][a-z0-9_]{0,19}$/.test(name) &&
      !["!join", "!help", "!forge"].includes(name) &&
      this.allowed(chat, "mod", 1000)
    ) {
      this.hooks.command(name, chat, sanitize(args, 240));
    }
    return "chat";
  }
}
