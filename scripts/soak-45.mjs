/* global window, document, requestAnimationFrame */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";
const tmp = resolve("runtime/tmp");
await mkdir(tmp, { recursive: true });
const data = await mkdtemp(join(tmp, "soak45-")),
  base = "http://localhost:3098",
  out = resolve("docs/media/soak"),
  hud = resolve("docs/media/hud");
await mkdir(out, { recursive: true });
await mkdir(hud, { recursive: true });
const started = Date.now(),
  duration = 45 * 60 * 1000;
const result = {
  startedAt: new Date(started).toISOString(),
  durationMs: 0,
  requiredMs: duration,
  intensity: "normal",
  preset: "demo",
  rounds: [],
  samples: [],
  restart: null,
  rollbacks: 0,
  maxLiveMods: 0,
  completed: false,
  errors: [],
};
let server,
  exited = true,
  context,
  page,
  stopping = false,
  stderr = "",
  restarted = false,
  lastSample = 0,
  lastKey = "",
  lastBins = Array(1001).fill(0),
  totalBins = Array(1001).fill(0),
  seen = new Set(),
  photos = new Set();
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
const persist = () =>
  writeFile(join(out, "report.json"), JSON.stringify(result, null, 2));
const post = async (name, body = {}) => {
  const r = await fetch(`${base}/api/forge/${name}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(`${name}: HTTP ${r.status}`);
};
async function launch() {
  exited = false;
  server = spawn(process.execPath, ["dist/apps/server/src/main.js"], {
    cwd: resolve("apps/server"),
    env: {
      ...process.env,
      PORT: "3098",
      CHAT_SOURCE: "simulator",
      SIM_INTENSITY: "normal",
      BUILDS_PER_HOUR: "30",
      CHATFORGE_METRICS: "1",
      CHATFORGE_RUNTIME_DIR: data,
      TEMP: tmp,
      TMP: tmp,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.once("exit", () => {
    exited = true;
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (b) => {
    stderr = (stderr + String(b)).slice(-10000);
  });
  for (let n = 0; n < 200; n++) {
    if (exited) throw Error("Soak server exited");
    try {
      const r = await fetch(base + "/api/forge/start", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: '{"preset":"demo"}',
      });
      if (r.ok) return;
    } catch {
      /* waiting for bind */
    }
    await delay(100);
  }
  throw Error("Soak server did not become ready");
}
async function shutdown() {
  if (!exited) {
    server.kill();
    for (let n = 0; n < 100 && !exited; n++) await delay(100);
  }
  if (!exited) throw Error("Owned soak server did not stop");
}
function addBins() {
  totalBins = totalBins.map((n, i) => n + lastBins[i]);
  lastBins = Array(1001).fill(0);
}
function p99(bins) {
  const count = bins.reduce((a, b) => a + b, 0);
  if (!count) return null;
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i];
    if (sum >= Math.ceil(count * 0.99)) return (i + 1) / 10;
  }
  return null;
}
async function exportSource(modId, roundId) {
  for (let attempt = 0; attempt < 12; attempt++) {
    let db;
    try {
      db = new DatabaseSync(join(data, "ideas.sqlite"), { readOnly: true });
      db.exec("PRAGMA busy_timeout=2000");
      const row = db
        .prepare("SELECT source FROM mod_versions WHERE id=?")
        .get(modId);
      if (!row) throw Error("Shipped source missing from database");
      await writeFile(join(out, `round-${roundId}.js`), row.source);
      return;
    } catch (error) {
      if (!/locked|busy/i.test(String(error)) || attempt === 11) throw error;
      await delay(250);
    } finally {
      db?.close();
    }
  }
}
try {
  await launch();
  context = await chromium.launchPersistentContext(join(data, "chrome"), {
    channel: "chrome",
    headless: true,
    viewport: { width: 1920, height: 1080 },
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(() => {
    window.__forgeFrames = [];
    let last = 0;
    function frame(now) {
      if (last) {
        window.__forgeFrames.push(now - last);
        if (window.__forgeFrames.length > 600) window.__forgeFrames.shift();
      }
      last = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  page.on("pageerror", (e) => result.errors.push("Browser: " + e.message));
  await page.goto(base + "/overlay/");
  await page.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
  );
  while (!stopping && Date.now() - started < duration) {
    await delay(1000);
    if (exited) throw Error("Soak server exited unexpectedly");
    const view = await (await fetch(base + "/api/forge")).json(),
      build = view.build,
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
    const id = phase === round?.stage ? round?.id : build?.id,
      key = `${id}-${phase}-${build?.attempts ?? 0}`;
    if (key !== lastKey) {
      console.log(
        JSON.stringify({
          minute: Math.floor((Date.now() - started) / 60000),
          round: id,
          phase,
          attempts: build?.attempts ?? 0,
          liveMods: view.mods.length,
        }),
      );
      lastKey = key;
    }
    if (phase && !photos.has(phase)) {
      photos.add(phase);
      await page.screenshot({
        path: join(hud, `m5-${phase.toLowerCase()}.png`),
      });
    }
    if (build && ["LIVE", "FAILED", "ROLLED_BACK"].includes(build.stage)) {
      const unique = `${build.id}:${build.stage}`;
      if (!seen.has(unique)) {
        seen.add(unique);
        if (build.stage === "ROLLED_BACK") result.rollbacks++;
        const card = build.cards?.[build.winner ?? 0],
          entry = {
            id: build.id,
            status: build.stage,
            title: card?.title,
            credits: card?.credits,
            buildMs: build.durationMs,
            attempts: build.attempts,
            score: build.report?.spectacle?.score,
            checks: build.report?.checks,
          };
        result.rounds.push(entry);
        if (build.stage === "LIVE" && build.modId) {
          try {
            await exportSource(build.modId, build.id);
          } catch (error) {
            result.errors.push(
              `Could not export source for round ${build.id}: ${String(error)}`,
            );
          }
        }
        console.log("ROUND " + JSON.stringify(entry));
        await persist();
      }
    }
    result.maxLiveMods = Math.max(result.maxLiveMods, view.mods.length);
    if (view.mods.length >= 10 && !photos.has("10patches")) {
      photos.add("10patches");
      await page.screenshot({
        path: join(hud, "m5-late-stream-10-patches.png"),
      });
    }
    if (Date.now() - lastSample >= 60000) {
      lastSample = Date.now();
      const m = await (await fetch(base + "/api/metrics")).json();
      lastBins = m.tickBins;
      const fps = await page.evaluate(() => {
        const a = window.__forgeFrames ?? [];
        const total = a.reduce((x, y) => x + y, 0),
          v = a.map((x) => 1000 / x).sort((x, y) => x - y);
        return {
          count: a.length,
          avg: total ? (a.length * 1000) / total : null,
          p5: v.length ? v[Math.floor(v.length * 0.05)] : null,
        };
      });
      result.samples.push({
        minute: (Date.now() - started) / 60000,
        rssMiB: m.rss / 1048576,
        tickP99UpperMs: p99(lastBins),
        fps,
        liveMods: view.mods.length,
      });
      await persist();
    }
    if (
      !restarted &&
      Date.now() - started >= duration / 2 &&
      (!build || !["BUILDING", "TESTING", "DEPLOYING"].includes(build.stage)) &&
      round?.stage === "COLLECTING"
    ) {
      const before = {
        mods: view.mods.map((x) => x.id),
        tick: await page.evaluate(() =>
          Number(document.querySelector("canvas")?.dataset.tick),
        ),
      };
      const metrics = await (await fetch(base + "/api/metrics")).json();
      lastBins = metrics.tickBins;
      addBins();
      await shutdown();
      await launch();
      restarted = true;
      await page.reload();
      await page.waitForFunction(
        () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
      );
      const afterView = await (await fetch(base + "/api/forge")).json(),
        after = {
          mods: afterView.mods.map((x) => x.id),
          tick: await page.evaluate(() =>
            Number(document.querySelector("canvas")?.dataset.tick),
          ),
        };
      result.restart = {
        before,
        after,
        modsPreserved:
          JSON.stringify(before.mods) === JSON.stringify(after.mods),
        checkpointResumed: after.tick > 0 && after.tick >= before.tick - 300,
      };
      console.log("RESTART " + JSON.stringify(result.restart));
      await persist();
    }
    if (
      round?.stage === "FAILED" &&
      !["BUILDING", "TESTING", "DEPLOYING"].includes(build?.stage)
    ) {
      result.errors.push("Curation failed; restart requested");
      await post("stop");
      await post("start", { preset: "demo" });
    }
  }
  result.durationMs = Date.now() - started;
  result.completed = !stopping && result.durationMs >= duration;
  try {
    const m = await (await fetch(base + "/api/metrics")).json();
    lastBins = m.tickBins;
  } catch {
    /* retain previous sample */
  }
  addBins();
  result.tickP99UpperMs = p99(totalBins);
  result.finishedAt = new Date().toISOString();
  await persist();
  console.log(
    `SOAK ${result.completed ? "COMPLETE" : "INTERRUPTED"} ${result.rounds.length} terminal events; tick p99 <= ${result.tickP99UpperMs} ms`,
  );
  if (!result.completed) process.exitCode = 1;
} catch (error) {
  result.durationMs = Date.now() - started;
  result.errors.push(String(error));
  if (stderr) console.error(stderr.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"));
  console.error(String(error));
  await persist();
  process.exitCode = 1;
} finally {
  try {
    await post("stop");
  } catch {
    /* server may have stopped */
  }
  await context?.close();
  try {
    await shutdown();
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
  await rm(data, { recursive: true, force: true });
}
