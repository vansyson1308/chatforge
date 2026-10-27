import { readdir, readFile, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve, relative, extname } from "node:path";
import { parseEnv } from "node:util";
const root = resolve("runtime"),
  local = resolve(".env");
let values = {};
try {
  values = parseEnv(await readFile(local, "utf8"));
} catch {
  /* No local env. */
}
const secrets = ["OPENAI_API_KEY", "TWITCH_CLIENT_SECRET"]
  .map((k) => values[k] ?? process.env[k])
  .filter((v) => typeof v === "string" && v.length >= 12);
const matches = new Set(),
  errors = [],
  extensions = new Set([
    ".log",
    ".jsonl",
    ".json",
    ".js",
    ".mjs",
    ".cjs",
    ".md",
    ".txt",
    ".ts",
    ".toml",
  ]);
let files = 0,
  rows = 0;
function inspect(data, path) {
  if (typeof data !== "string") return;
  if (
    secrets.some((value) => data.includes(value)) ||
    /sk-[A-Za-z0-9_-]{25,}/.test(data)
  )
    matches.add(relative(root, path));
}
function sqlite(path) {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all();
      for (const table of tables) {
        const name = String(table.name).replaceAll('"', '""');
        for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
          rows++;
          for (const value of Object.values(row)) inspect(value, path);
        }
      }
    } finally {
      db.close();
    }
  } catch {
    errors.push(relative(root, path));
  }
}
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, item.name),
      rel = relative(root, full);
    if (item.isSymbolicLink() || rel === "secrets" || rel === "tmp") continue;
    if (item.isDirectory()) await walk(full);
    else if (item.isFile()) {
      const info = await stat(full);
      if (item.name.endsWith(".sqlite")) {
        sqlite(full);
        continue;
      }
      if (!extensions.has(extname(item.name))) continue;
      if (info.size > 32 * 1024 * 1024) {
        errors.push(rel + ": too large");
        continue;
      }
      files++;
      try {
        inspect(await readFile(full, "utf8"), full);
      } catch {
        errors.push(rel + ": unreadable");
      }
    }
  }
}
try {
  await walk(root);
} catch {
  errors.push("runtime directory unreadable");
}
const codexLog = resolve(root, "secrets/forge-codex/logs_2.sqlite");
try {
  await stat(codexLog);
  sqlite(codexLog);
} catch {
  /* SDK has not created logs. */
}
console.log(
  JSON.stringify({
    textFilesScanned: files,
    sqliteRowsScanned: rows,
    filesWithPotentialSecrets: [...matches],
    errors,
    excluded:
      "Credential storage and active temporary directories are intentionally excluded.",
  }),
);
if (matches.size || errors.length) process.exitCode = 1;
