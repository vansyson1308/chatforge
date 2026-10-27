/* global document */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";
const data = await mkdtemp(join(tmpdir(), "chatforge-soak-"));
const base = "http://localhost:3098",
  directory = resolve("docs/media/hud");
await mkdir(directory, { recursive: true });
const server = spawn(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: resolve("apps/server"),
  env: {
    ...process.env,
    PORT: "3098",
    CHAT_SOURCE: "simulator",
    SIM_INTENSITY: "hype",
    CHATFORGE_RUNTIME_DIR: data,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let exited = false,
  browser,
  log = "",
  stopping = false;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
server.on("exit", () => {
  exited = true;
});
server.stderr.on("data", (b) => {
  log = (log + String(b)).slice(-12000);
});
server.stdout.on("data", () => {});
const post = async (action, body = {}) => {
  const res = await fetch(`${base}/api/forge/${action}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Error(`${action}: HTTP ${res.status}`);
};
const completed = [],
  screens = new Set(),
  started = Date.now();
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(`${base}/api/forge`)).ok) break;
    } catch {
      /* The owned server may still be starting or stopping. */
    }
    await delay(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/overlay/`);
  await page.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
  );
  await post("start", { preset: "demo" });
  let last = "";
  while (
    !stopping &&
    Date.now() - started < 20 * 60 * 1000 &&
    completed.length < 3
  ) {
    await delay(500);
    const view = await (await fetch(`${base}/api/forge`)).json();
    const build = view.build,
      round = view.round;
    const phase =
      build &&
      [
        "BUILDING",
        "TESTING",
        "DEPLOYING",
        "LIVE",
        "FAILED",
        "ROLLED_BACK",
      ].includes(build.stage)
        ? build.stage
        : round?.stage;
    const id = phase === round?.stage ? round.id : build?.id;
    const key = `${id}-${phase}-${build?.attempts ?? 0}`;
    if (key !== last) {
      console.log(
        JSON.stringify({
          seconds: Math.round((Date.now() - started) / 1000),
          round: id,
          phase,
          attempts: build?.attempts ?? 0,
        }),
      );
      last = key;
    }
    if (phase && !screens.has(key)) {
      screens.add(key);
      await page.screenshot({
        path: join(directory, `${key.toLowerCase()}.png`),
      });
    }
    if (
      round?.stage === "FAILED" ||
      build?.stage === "FAILED" ||
      build?.stage === "ROLLED_BACK"
    )
      throw Error(
        JSON.stringify({
          round: build?.id ?? round?.id,
          notice: view.notice,
          report: build?.report,
        }),
      );
    if (build?.stage === "LIVE" && !completed.includes(build.id)) {
      completed.push(build.id);
      const db = new DatabaseSync(join(data, "ideas.sqlite"), {
        readOnly: true,
      });
      try {
        const row = db
          .prepare("SELECT source,card FROM mod_versions WHERE id=?")
          .get(build.modId);
        const report = {
          round: build.id,
          card: JSON.parse(row.card),
          report: build.report,
          buildSeconds: build.durationMs / 1000,
          attempts: build.attempts,
          threadId: db
            .prepare("SELECT threadId FROM seasons ORDER BY id DESC LIMIT 1")
            .get().threadId,
          timeline: db
            .prepare(
              "SELECT stage,time FROM transitions WHERE roundId=? ORDER BY id",
            )
            .all(build.id),
        };
        const prefix = resolve("docs/media/sample-mods", `m4-soak-${build.id}`);
        await writeFile(prefix + ".js", row.source);
        await writeFile(prefix + ".json", JSON.stringify(report, null, 2));
        console.log("LIVE " + JSON.stringify(report));
      } finally {
        db.close();
      }
      if (completed.length === 3) await post("stop");
      await delay(3200);
      await page.screenshot({
        path: join(directory, `${build.id}-mod-in-action.png`),
      });
    }
  }
  if (completed.length !== 3)
    throw Error("Soak did not reach three LIVE rounds before deadline");
  await page.keyboard.press("h");
  await delay(200);
  await page.screenshot({ path: join(directory, "hall-of-patches.png") });
  await page.goto(`${base}/overlay/?mode=overlay&hall=1`);
  await delay(1000);
  await page.screenshot({ path: join(directory, "transparent-overlay.png") });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `PASS: ${completed.length}/3 real consecutive rounds LIVE; no time acceleration.`,
  );
} catch (error) {
  console.error(String(error));
  if (log) console.error(log.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"));
  process.exitCode = 1;
} finally {
  try {
    await post("stop");
  } catch {
    /* The owned server may still be starting or stopping. */
  }
  await browser?.close();
  if (!exited) {
    server.kill();
    for (let n = 0; n < 50 && !exited; n++) await delay(100);
  }
  if (!exited) {
    console.error("Owned server did not stop");
    process.exitCode = 1;
  }
  await rm(data, { recursive: true, force: true });
}
