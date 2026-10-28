import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ForgeStore } from "./forge-store.js";
const exec = promisify(execFile);
it("creates a fresh empty season while preserving Twitch tokens and historical data", async () => {
  const tmp = resolve("runtime/tmp");
  await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, "reset-test-"));
  const token = join(dir, "secrets", "twitch.json");
  await mkdir(join(dir, "secrets"));
  await writeFile(token, "fixture-token");
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  const port = address.port;
  await new Promise<void>((done) => probe.close(() => done()));
  const db = new DatabaseSync(join(dir, "ideas.sqlite"));
  db.exec(
    "CREATE TABLE seasons(id INTEGER PRIMARY KEY,startedAt INTEGER NOT NULL,threadId TEXT,checkpoint TEXT,responsesTokens INTEGER NOT NULL DEFAULT 0); INSERT INTO seasons(id,startedAt,checkpoint) VALUES(1,1,'old'); CREATE TABLE ideas(id INTEGER PRIMARY KEY,status TEXT,reason TEXT); INSERT INTO ideas VALUES(1,'pending','')",
  );
  db.close();
  try {
    await exec(process.execPath, ["scripts/demo-reset.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), CHATFORGE_RUNTIME_DIR: dir },
    });
    const check = new DatabaseSync(join(dir, "ideas.sqlite"));
    try {
      expect(check.prepare("SELECT COUNT(*) AS n FROM seasons").get()?.n).toBe(
        2,
      );
      expect(
        check.prepare("SELECT checkpoint FROM seasons ORDER BY id DESC").get()
          ?.checkpoint,
      ).toBeNull();
      expect(
        check.prepare("SELECT status FROM ideas WHERE id=1").get()?.status,
      ).toBe("rejected");
      expect(
        check
          .prepare("SELECT value FROM settings WHERE key='demo-empty-mods'")
          .get()?.value,
      ).toBe("true");
      const store = new ForgeStore(check);
      const first = store.createRound(1);
      const second = store.createRound(2);
      expect([first.number, second.number]).toEqual([1, 2]);
      check.prepare("INSERT INTO seasons(startedAt) VALUES(?)").run(3);
      const nextSeason = new ForgeStore(check);
      const next = nextSeason.createRound(4);
      expect(next.id).toBeGreaterThan(second.id);
      expect(next.number).toBe(1);
      expect(new ForgeStore(check).latestRounds()[0]?.number).toBe(1);
    } finally {
      check.close();
    }
    expect(await readFile(token, "utf8")).toBe("fixture-token");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
