import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";

let local = {};
try {
  local = parseEnv(await readFile(resolve(".env"), "utf8"));
} catch {
  /* Optional local config. */
}
const port = Number(process.env.PORT ?? local.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid PORT");
const probe = createServer();
try {
  await new Promise((done, reject) =>
    probe.once("error", reject).listen(port, "127.0.0.1", done),
  );
} catch {
  throw Error("Stop the ChatForge server before resetting the demo season.");
}
await new Promise((done, reject) =>
  probe.close((error) => (error ? reject(error) : done())),
);
const runtime = resolve(process.env.CHATFORGE_RUNTIME_DIR ?? "runtime");
await mkdir(runtime, { recursive: true });
const db = new DatabaseSync(join(runtime, "ideas.sqlite"));
try {
  db.exec("PRAGMA busy_timeout=2000; BEGIN IMMEDIATE");
  db.exec(
    "CREATE TABLE IF NOT EXISTS seasons(id INTEGER PRIMARY KEY,startedAt INTEGER NOT NULL,threadId TEXT,checkpoint TEXT,responsesTokens INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
  );
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ideas'",
      )
      .get()
  )
    db.exec(
      "UPDATE ideas SET status='rejected', reason='Previous demo season' WHERE status IN ('pending','not chosen')",
    );
  db.prepare("INSERT INTO seasons(startedAt) VALUES(?)").run(Date.now());
  db.prepare(
    "INSERT OR REPLACE INTO settings(key,value) VALUES('demo-empty-mods','true')",
  ).run();
  db.exec("COMMIT");
  console.log(
    "Fresh demo season created. Start pnpm stream to begin with the base keep and no active mods. Twitch tokens and past seasons are preserved.",
  );
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {
    /* no active transaction */
  }
  throw error;
} finally {
  db.close();
}
