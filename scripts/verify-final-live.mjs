/* global document */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Requires the operator's already-running `pnpm stream` with Twitch + SIM.
// Sends real Forge announcements, as requested by the recording verification.
const base = "http://localhost:3000";
const output = resolve("docs/media/hud");
await mkdir(output, { recursive: true });
const get = async (path) => {
  const response = await fetch(base + path);
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const post = async (path, body = {}) => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const initial = await get("/api/status");
assert.equal(
  initial.auth.health,
  "healthy",
  "Twitch login must already be healthy",
);
assert.equal(initial.eventsub.state, "connected", "EventSub must be connected");
assert.equal(initial.eventsub.subscriptions.find((entry) => entry.type === "channel.chat.message")?.status, "enabled", "Chat EventSub must be enabled");
assert(
  initial.config.sources.includes("twitch") &&
    initial.config.sources.includes("simulator"),
  "Twitch and SIM must both be enabled",
);
assert.equal(
  (await get("/api/forge")).running,
  false,
  "Start with Forge stopped",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const captured = new Set(),
  live = new Map(),
  failures = [],
  logs = new Map();
let cancelled = false,
  forceSet = false,
  stopRequested = false,
  nextScreenshot = false;
const started = Date.now();
async function capture(name) {
  if (captured.has(name)) return;
  await page.screenshot({ path: resolve(output, `final-${name}.png`) });
  captured.add(name);
  console.log(`CAPTURE ${name}`);
}
try {
  await page.goto(base + "/overlay/?clean=1");
  await page.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
  );
  await post("/api/forge/start", { preset: "demo" });
  while (Date.now() - started < 15 * 60 * 1000) {
    await delay(200);
    const view = await get("/api/forge");
    const status = await get("/api/status");
    for (const entry of status.log)
      if (entry.source === "Twitch out" && entry.time >= started)
        logs.set(entry.id, entry);
    const build = view.build,
      round = view.round;
    if (
      view.ideas?.length &&
      ["COLLECTING", "CURATING"].includes(round?.stage) &&
      (!build || build.stage === "IDLE")
    )
      await capture("feed");
    if (round?.stage === "VOTING" && live.size < 3) await capture("voting");
    if (
      build?.stage === "BUILDING" &&
      view.code?.lines?.length &&
      view.code?.sprite
    )
      await capture("build-code-sprite");
    if (build?.stage === "TESTING" && build.report?.checks?.length)
      await capture("gatekeeper");
    if (build?.stage === "SHOWCASE") {
      if (view.notice.startsWith("Shipped:")) await capture("shipped");
      if (view.notice.includes("try it yourself")) {
        await delay(400);
        await capture("showcase");
      }
    }
    if (build?.stage === "LIVE" && !live.has(build.id)) {
      live.set(build.id, {
        id: build.id,
        title: build.cards[build.winner]?.title,
        attempts: build.attempts,
        durationMs: build.durationMs,
      });
      console.log(
        `LIVE ${build.id} attempt ${build.attempts} ${build.durationMs}ms`,
      );
    }
    if (!nextScreenshot && live.size && round?.stage === "COLLECTING") {
      await capture("next-round");
      nextScreenshot = true;
    }
    if (build?.stage === "FAILED" && !failures.includes(build.id))
      failures.push(build.id);
    // A fourth real build is intentionally cancelled to verify the real Twitch failure announcement.
    if (live.size >= 3 && !cancelled && round?.stage === "COLLECTING")
      await post("/api/forge/director-skip");
    if (live.size >= 3 && !cancelled && round?.stage === "VOTING") {
      if (!forceSet) {
        await post("/api/forge/director-winner", { choice: 1 });
        forceSet = true;
      }
      await post("/api/forge/director-skip");
    }
    if (live.size >= 3 && !cancelled && round?.stage === "STREAMER_APPROVAL")
      await post("/api/forge/director-skip");
    if (live.size >= 3 && !cancelled && build?.stage === "BUILDING") {
      await post("/api/forge/cancel");
      cancelled = true;
    }
    if (cancelled && build?.stage === "FAILED" && !stopRequested) {
      await post("/api/forge/stop");
      stopRequested = true;
    }
    if (
      stopRequested &&
      [...logs.values()].some((e) =>
        /sent:.*(?:Build cancelled|Build failed)/i.test(e.text),
      )
    )
      break;
  }
  const events = [...logs.values()];
  const received = Object.fromEntries(
    Object.entries({
      open: /sent:.*Forge open!/i,
      voting: /sent:.*Voting open!/i,
      winner: /sent:.*Winner:/i,
      shipped: /sent:.*Shipped:/i,
      showcase: /sent:.*try it yourself/i,
      failed: /sent:.*(?:Build cancelled|Build failed)/i,
    }).map(([name, pattern]) => [
      name,
      events.some((e) => pattern.test(e.text)),
    ]),
  );
  const evidence = {
    realTwitch: true,
    source: "Twitch plus normal Crowd Sim",
    live: [...live.values()],
    intentionallyCancelledFourthBuild: cancelled,
    captured: [...captured],
    outboundSent: received,
    outboundSentTimes: events
      .filter((e) => e.text.startsWith("sent:"))
      .map((e) => e.time),
    failures,
  };
  await writeFile(
    resolve("docs/media/hud/final-live-report.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
  assert.equal(live.size >= 3, true, "Three real builds must finish");
  assert(
    Object.values(received).every(Boolean),
    "Expected Twitch announcements must be observed as sent",
  );
  for (const name of [
    "feed",
    "voting",
    "build-code-sprite",
    "gatekeeper",
    "shipped",
    "showcase",
    "next-round",
  ])
    assert(captured.has(name), `Missing actual screenshot: ${name}`);
} finally {
  if (!stopRequested) {
    try {
      await post("/api/forge/stop");
    } catch {
      /* already stopped */
    }
  }
  await browser.close();
}
