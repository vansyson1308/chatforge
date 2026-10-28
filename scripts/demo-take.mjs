import { spawn } from "node:child_process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2),
  sim = args.includes("--sim");
const i = args.indexOf("--minutes");
const minutes = i < 0 ? 15 : Number(args[i + 1]);
if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60)
  throw Error("--minutes must be between 0 and 60");
let local = {};
try {
  local = parseEnv(await readFile(".env", "utf8"));
} catch {
  /* optional */
}
const port = Number(local.PORT || process.env.PORT || 3000),
  base = `http://localhost:${port}`;
const dir = resolve(
  "runtime/recordings",
  new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"),
);
await mkdir(dir, { recursive: true });
const run = (file, argv, env = process.env) =>
  new Promise((ok, bad) => {
    const child = spawn(file, argv, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", bad);
    child.once("exit", (code) =>
      code === 0 ? ok() : bad(Error(`${file} exited ${code}`)),
    );
  });
await run(process.execPath, ["scripts/demo-reset.mjs"]);
const server = spawn(process.execPath, ["scripts/stream.mjs"], {
  env: { ...process.env, CHAT_SOURCE: sim ? "simulator" : "twitch,simulator" },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true,
});
let browser,
  overlayContext,
  chatContext,
  stopping = false,
  ended = false;
server.once("exit", () => {
  ended = true;
});
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
const timeline = {
  source: sim ? "SIM ONLY DRY TAKE" : "TWITCH AND SIM",
  startedAt: "",
  stages: [],
  completedShowcases: 0,
};
const post = async (path, body = {}) => {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(`${path}: HTTP ${r.status}`);
};
try {
  let ready = false;
  for (let n = 0; n < 150; n++) {
    if (ended) throw Error("Stream server exited");
    try {
      if ((await fetch(base + "/api/forge")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await delay(100);
  }
  if (!ready) throw Error("Stream server did not start");
  if (!sim) {
    let connected = false;
    for (let n = 0; n < 100; n++) {
      const status = await (await fetch(base + "/api/status")).json();
      if (
        status.auth.health === "healthy" &&
        status.eventsub.state === "connected"
      ) {
        connected = true;
        break;
      }
      await delay(300);
    }
    if (!connected)
      throw Error("Connect Twitch in dashboard before the real take");
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const settings = {
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  };
  overlayContext = await browser.newContext(settings);
  chatContext = await browser.newContext(settings);
  const videoStart = Date.now();
  const overlay = await overlayContext.newPage(),
    chat = await chatContext.newPage();
  await Promise.all([
    overlay.goto(base + "/overlay/?mode=full&clean=1"),
    sim
      ? chat.goto(
          'data:text/html,<body style="background:%23141b26;color:white;font:32px sans-serif;padding:80px">SIM-ONLY DRY TAKE<br>No Twitch chat recorded</body>',
        )
      : chat.goto("https://www.twitch.tv/popout/vansyson1308/chat", {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
  ]);
  const start = Date.now();
  timeline.recordingOffsetMs = start - videoStart;
  timeline.startedAt = new Date(start).toISOString();
  await post("/api/forge/start", { preset: "demo" });
  let last = "",
    lastShowcase = 0;
  while (
    !stopping &&
    Date.now() - start < minutes * 60000 &&
    timeline.completedShowcases < 2
  ) {
    if (ended) throw Error("Stream server exited during take");
    const view = await (await fetch(base + "/api/forge")).json();
    const build = view.build,
      round = view.round;
    const stage = [
      "BUILDING",
      "TESTING",
      "DEPLOYING",
      "SHOWCASE",
      "FAILED",
    ].includes(build?.stage)
      ? build.stage
      : (round?.stage ?? build?.stage ?? "IDLE");
    const key = `${stage}:${build?.id ?? ""}:${round?.id ?? ""}`;
    if (key !== last) {
      timeline.stages.push({
        atMs: Date.now() - start,
        stage,
        buildId: build?.id ?? null,
        roundId: round?.id ?? null,
      });
      console.log(`TAKE ${stage} ${Math.round((Date.now() - start) / 1000)}s`);
      last = key;
    }
    if (build?.stage === "LIVE" && build.id !== lastShowcase) {
      lastShowcase = build.id;
      timeline.completedShowcases++;
    }
    await delay(500);
  }
  await post("/api/forge/stop");
  timeline.durationMs = Date.now() - start;
  const overlayVideo = overlay.video(),
    chatVideo = chat.video();
  await overlayContext.close();
  overlayContext = undefined;
  await chatContext.close();
  chatContext = undefined;
  await rename(await overlayVideo.path(), join(dir, "overlay.webm"));
  await rename(await chatVideo.path(), join(dir, "chat.webm"));
  await writeFile(
    join(dir, "timeline.json"),
    JSON.stringify(timeline, null, 2),
  );
  console.log(`TAKE_DIR ${dir}`);
} finally {
  await overlayContext?.close();
  await chatContext?.close();
  await browser?.close();
  if (!ended) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(5000),
    ]);
  }
}
