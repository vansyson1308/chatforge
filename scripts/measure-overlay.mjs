import { chromium } from "playwright-core";
/* global document, requestAnimationFrame */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";

import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const testTempRoot = resolve("runtime/tmp");
await mkdir(testTempRoot, { recursive: true });
process.env.TEMP = testTempRoot;
process.env.TMP = testTempRoot;
const data = await mkdtemp(join(testTempRoot, "chatforge-fps-")),
  base = "http://localhost:3099";
const server = spawn(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: resolve("apps/server"),
  env: {
    ...process.env,
    PORT: "3099",
    NODE_ENV: "development",
    CHAT_SOURCE: "simulator",
    CHATFORGE_RUNTIME_DIR: data,
  },
  stdio: "ignore",
  windowsHide: true,
});
let exited = false,
  browser;
server.once("exit", () => {
  exited = true;
});
try {
  for (let n = 0; n < 100; n++) {
    if (exited) throw Error("Owned FPS server exited");
    try {
      if ((await fetch(base + "/api/forge")).ok) break;
    } catch {
      /* Wait for fixture server. */
    }
    await delay(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/overlay/?mode=full");
  const response = await page.evaluate(async () => {
    const res = await fetch("/dev/populate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 300 }),
    });
    return res.status;
  });
  if (response !== 200) throw Error(`Population endpoint: HTTP ${response}`);
  await page.waitForFunction(
    () => Number(document.querySelector("#game")?.dataset.entities) >= 300,
  );
  await page.waitForTimeout(2000);
  const profiler =
    process.env.CHATFORGE_PROFILE === "1"
      ? await page.context().newCDPSession(page)
      : undefined;
  if (profiler) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
  }
  const metrics = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const intervals = [];
        let last = 0,
          start = 0,
          minEntities = Infinity;
        function frame(now) {
          minEntities = Math.min(
            minEntities,
            Number(document.querySelector("#game")?.dataset.entities),
          );
          if (!start) start = now;
          if (last) intervals.push(now - last);
          last = now;
          if (now - start < 10000) {
            requestAnimationFrame(frame);
            return;
          }
          const fps = intervals.map((ms) => 1000 / ms).sort((a, b) => a - b);
          resolve({
            frames: intervals.length,
            elapsedMs: now - start,
            avgFps: (intervals.length * 1000) / (now - start),
            p5Fps: fps[Math.floor(fps.length * 0.05)],
            minEntities,
          });
        }
        requestAnimationFrame(frame);
      }),
  );
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    console.log(
      "CPU_PROFILE " +
        JSON.stringify(
          profile.nodes
            .filter((n) => n.hitCount)
            .sort((a, b) => b.hitCount - a.hitCount)
            .slice(0, 16)
            .map((n) => ({
              function: n.callFrame.functionName,
              hits: n.hitCount,
              line: n.callFrame.lineNumber,
            })),
        ),
    );
  }
  console.log("OVERLAY_FPS " + JSON.stringify(metrics));
  if (errors.length) throw Error(errors.join("\n"));
  if (metrics.minEntities < 300 || metrics.avgFps < 58 || metrics.p5Fps < 50)
    throw Error("Overlay FPS gate failed");
} finally {
  await browser?.close();
  if (!exited) {
    server.kill();
    for (let n = 0; n < 50 && !exited; n++) await delay(100);
  }
  if (!exited) {
    console.error("Owned FPS server did not stop");
    process.exitCode = 1;
  }
  await rm(data, { recursive: true, force: true });
}
