import type { DatabaseSync } from "node:sqlite";
import type {
  ForgeRound,
  ForgeCard,
} from "../../../packages/shared/src/forge.js";
import type { HostCheckpoint } from "./mod-host.js";

export class ForgeStore {
  readonly season: number;
  constructor(readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS seasons(id INTEGER PRIMARY KEY,startedAt INTEGER NOT NULL,threadId TEXT,checkpoint TEXT,responsesTokens INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY,season INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transitions(id INTEGER PRIMARY KEY,roundId INTEGER NOT NULL,stage TEXT NOT NULL,time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cards(roundId INTEGER NOT NULL,position INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(roundId,position));
      CREATE TABLE IF NOT EXISTS votes(roundId INTEGER NOT NULL,viewer TEXT NOT NULL,choice INTEGER NOT NULL,PRIMARY KEY(roundId,viewer));
      CREATE TABLE IF NOT EXISTS builds(id INTEGER PRIMARY KEY,roundId INTEGER NOT NULL,startedAt INTEGER NOT NULL,threadId TEXT,attempts INTEGER NOT NULL DEFAULT 0,durationMs INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,report TEXT);
      CREATE TABLE IF NOT EXISTS mod_versions(id TEXT PRIMARY KEY,season INTEGER NOT NULL,roundId INTEGER NOT NULL,source TEXT NOT NULL,card TEXT NOT NULL,active INTEGER NOT NULL,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS contributors(modId TEXT NOT NULL,viewer TEXT NOT NULL,name TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(modId,viewer));`);
    const row = db
      .prepare("SELECT id FROM seasons ORDER BY id DESC LIMIT 1")
      .get();
    this.season = row
      ? Number(row.id)
      : Number(
          db.prepare("INSERT INTO seasons(startedAt) VALUES(?)").run(Date.now())
            .lastInsertRowid,
        );
  }
  createRound(now: number): ForgeRound {
    const id = Number(
      this.db
        .prepare("INSERT INTO rounds(season,data) VALUES(?,'{}')")
        .run(this.season).lastInsertRowid,
    );
    const round: ForgeRound = {
      id,
      stage: "IDLE",
      startedAt: now,
      deadline: null,
      cards: [],
      tallies: [0, 0, 0],
      winner: null,
      ideaIds: [],
      modId: null,
      attempts: 0,
      durationMs: 0,
      report: null,
    };
    this.save(round, now);
    return round;
  }
  save(round: ForgeRound, now: number, transition = true): void {
    this.db
      .prepare("UPDATE rounds SET data=? WHERE id=?")
      .run(JSON.stringify(round), round.id);
    if (transition)
      this.db
        .prepare("INSERT INTO transitions(roundId,stage,time) VALUES(?,?,?)")
        .run(round.id, round.stage, now);
    round.cards.forEach((card, i) =>
      this.db
        .prepare("INSERT OR REPLACE INTO cards VALUES(?,?,?)")
        .run(round.id, i, JSON.stringify(card)),
    );
  }
  latestRounds(): ForgeRound[] {
    return this.db
      .prepare(
        `SELECT data FROM rounds WHERE season=?
         ORDER BY CASE WHEN json_extract(data,'$.stage') IN ('BUILDING','TESTING','DEPLOYING','CURATING') THEN 0 ELSE 1 END, id DESC LIMIT 2`,
      )
      .all(this.season)
      .map((r) => JSON.parse(String(r.data)) as ForgeRound);
  }
  vote(round: number, viewer: string, choice: number): number[] {
    this.db
      .prepare(
        "INSERT INTO votes VALUES(?,?,?) ON CONFLICT(roundId,viewer) DO UPDATE SET choice=excluded.choice",
      )
      .run(round, viewer, choice);
    const tallies = [0, 0, 0];
    for (const row of this.db
      .prepare(
        "SELECT choice,COUNT(*) AS count FROM votes WHERE roundId=? GROUP BY choice",
      )
      .all(round))
      tallies[Number(row.choice) - 1] = Number(row.count);
    return tallies;
  }
  get threadId(): string | undefined {
    return this.db
      .prepare("SELECT threadId FROM seasons WHERE id=?")
      .get(this.season)?.threadId as string | undefined;
  }
  set threadId(id: string | undefined) {
    this.db
      .prepare("UPDATE seasons SET threadId=? WHERE id=?")
      .run(id ?? null, this.season);
    this.db
      .prepare(
        "UPDATE builds SET threadId=? WHERE status IN ('BUILDING','TESTING') AND roundId IN (SELECT id FROM rounds WHERE season=?)",
      )
      .run(id ?? null, this.season);
  }
  checkpoint(value?: HostCheckpoint): HostCheckpoint | undefined {
    if (value)
      this.db
        .prepare("UPDATE seasons SET checkpoint=? WHERE id=?")
        .run(JSON.stringify(value), this.season);
    const data = this.db
      .prepare("SELECT checkpoint FROM seasons WHERE id=?")
      .get(this.season)?.checkpoint;
    return data ? (JSON.parse(String(data)) as HostCheckpoint) : undefined;
  }
  beginBuild(round: number, now: number): number {
    return Number(
      this.db
        .prepare(
          "INSERT INTO builds(roundId,startedAt,status) VALUES(?,?,'BUILDING')",
        )
        .run(round, now).lastInsertRowid,
    );
  }
  saveBuild(id: number, round: ForgeRound): void {
    this.db
      .prepare(
        "UPDATE builds SET threadId=?,attempts=?,durationMs=?,status=?,report=? WHERE id=?",
      )
      .run(
        this.threadId ?? null,
        round.attempts,
        round.durationMs,
        round.stage,
        JSON.stringify(round.report),
        id,
      );
  }
  usage(now: number): { buildsThisHour: number; responsesTokens: number } {
    return {
      buildsThisHour: Number(
        this.db
          .prepare("SELECT COUNT(*) AS count FROM builds WHERE startedAt>?")
          .get(now - 3600000)?.count ?? 0,
      ),
      responsesTokens: Number(
        this.db
          .prepare("SELECT responsesTokens FROM seasons WHERE id=?")
          .get(this.season)?.responsesTokens ?? 0,
      ),
    };
  }
  addTokens(tokens: number): void {
    this.db
      .prepare(
        "UPDATE seasons SET responsesTokens=responsesTokens+? WHERE id=?",
      )
      .run(tokens, this.season);
  }
  deploy(round: ForgeRound, source: string, now: number): void {
    const card = round.cards[round.winner!]!;
    this.db
      .prepare("INSERT INTO mod_versions VALUES(?,?,?,?,?,1,?)")
      .run(
        round.modId!,
        this.season,
        round.id,
        source,
        JSON.stringify(card),
        now,
      );
    for (const credit of card.credits)
      this.db
        .prepare("INSERT OR REPLACE INTO contributors VALUES(?,?,?,?)")
        .run(
          round.modId!,
          `${credit.source}:${credit.id}`,
          credit.name,
          credit.source,
        );
  }
  reconcile(ids: string[]): void {
    for (const mod of this.mods())
      if (!ids.includes(mod.id))
        this.db
          .prepare("UPDATE mod_versions SET active=0 WHERE id=?")
          .run(mod.id);
  }
  mods(
    includeHistory = false,
  ): { id: string; title: string; credits: ForgeCard["credits"] }[] {
    return this.db
      .prepare(
        `SELECT id,card FROM mod_versions WHERE season=? ${includeHistory ? "" : "AND active=1"} ORDER BY createdAt`,
      )
      .all(this.season)
      .map((row) => {
        const card = JSON.parse(String(row.card)) as ForgeCard;
        return { id: String(row.id), title: card.title, credits: card.credits };
      });
  }
  summaries(): string[] {
    return this.db
      .prepare("SELECT card FROM mod_versions WHERE season=? AND active=1")
      .all(this.season)
      .map((row) => {
        const card = JSON.parse(String(row.card)) as ForgeCard;
        return `${card.title}: ${card.pitch} Commands: ${card.commands.join(" ")}`;
      });
  }
  patchNotes(): string {
    const escape = (text: string) =>
      text.replace(/[\\`*_{}[\]()<>#!|]/g, "\\$&").replace(/[\r\n]/g, " ");
    const entries = this.db
      .prepare(
        "SELECT id,card,active FROM mod_versions WHERE season=? ORDER BY createdAt",
      )
      .all(this.season)
      .map((row) => {
        const card = JSON.parse(String(row.card)) as ForgeCard;
        return `## ${escape(card.title)} (${row.active ? "live" : "rolled back"})\n\n${escape(card.pitch)}\n\n${card.credits.length ? "Thanks " + card.credits.map((c) => `${c.source === "simulator" ? "[SIM] " : ""}@${escape(c.name)}`).join(", ") : "Forge suggestion"}. Commands: ${card.commands.map(escape).join(", ") || "automatic"}.\n`;
      });
    return `# ChatForge - session ${this.season}\n\n${entries.join("\n") || "No mods shipped yet.\n"}`;
  }
}
