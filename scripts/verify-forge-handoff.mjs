/* global document */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { get } from "node:http";

// Isolated data: never reads the user's Twitch token or sends chat/AI requests.
const data = await mkdtemp(join(tmpdir(), "chatforge-browser-"));
const port = 3097,
  base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: resolve("apps/server"),
  env: {
    ...process.env,
    PORT: String(port),
    CHAT_SOURCE: "simulator",
    SIM_INTENSITY: "hype",
    CHATFORGE_RUNTIME_DIR: data,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let browser;
let exited = false;
server.on("exit", () => {
  exited = true;
});
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (exited) throw Error("Fixture server exited");
    try {
      const response = await fetch(`${base}/api/forge`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the owned fixture server to bind its port. */
    }
    await delay(100);
  }
  assert.ok(ready, "Fixture server ready");
  const headers = {
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
  };
  const status = (path) =>
    new Promise((resolve, reject) =>
      get(`${base}${path}`, { headers }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", reject),
    );
  assert.equal(await status("/dashboard/"), 200);
  assert.equal(await status("/overlay/"), 200);
  assert.equal(await status("/api/forge"), 403);
  assert.equal(
    (
      await fetch(`${base}/api/forge/start`, {
        method: "POST",
        headers: {
          Origin: "https://foreign.invalid",
          "Content-Type": "application/json",
        },
        body: '{"preset":"demo"}',
      })
    ).status,
    403,
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/dashboard/`);
  await page
    .getByRole("heading", { name: "Live Forge", exact: true })
    .waitFor();
  await page.getByLabel("Forge preset").selectOption("normal");
  await page.getByRole("button", { name: "Start Forge", exact: true }).click();
  await page
    .locator(".forge-round")
    .getByText("COLLECTING", { exact: true })
    .waitFor();
  assert.equal(
    (await (await fetch(`${base}/api/forge`)).json()).preset,
    "normal",
  );
  await page.getByRole("button", { name: "Stop Forge", exact: true }).click();
  await page
    .getByRole("button", { name: "Start Forge", exact: true })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Safe Mode", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "SAFE MODE" }).waitFor();
  const patch = await fetch(`${base}/forge/patch-notes`);
  assert.equal(patch.status, 200);
  assert.match(await patch.text(), /# ChatForge/);
  const overlay = await browser.newPage({
    viewport: { width: 1200, height: 675 },
  });
  overlay.on("pageerror", (error) => errors.push(error.message));
  await overlay.goto(`${base}/overlay/`);
  await overlay.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
  );
  // Preview saved real cards without triggering another paid round or changing the DB.
  const samples = await Promise.all(
    ["forge-1-6", "forge-1-8"].map(async (id) =>
      JSON.parse(
        await readFile(resolve(`docs/media/sample-mods/${id}.json`), "utf8"),
      ),
    ),
  );
  const preview = await (await fetch(`${base}/api/forge`)).json();
  preview.running = true;
  preview.now = Date.now();
  preview.notice = "Preview of the two verified dry-run mods";
  preview.round = {
    id: 999,
    stage: "VOTING",
    deadline: Date.now() + 30000,
    startedAt: Date.now(),
    cards: [
      samples[0].card,
      samples[1].card,
      {
        ...samples[0].card,
        title: "Forge suggestion",
        credits: [],
        suggestion: true,
      },
    ],
    tallies: [7, 4, 2],
    winner: null,
    ideaIds: [],
    modId: null,
    attempts: 0,
    durationMs: 0,
    report: null,
  };
  preview.build = {
    ...preview.round,
    id: 998,
    stage: "LIVE",
    deadline: null,
    winner: 0,
    modId: "forge-1-6",
    attempts: 1,
    durationMs: 58130,
    report: samples[0].report,
  };
  preview.activity = [
    "Reading MOD_API.md and card.json",
    "Running local Gatekeeper (exit 0)",
    "Gatekeeper: PASS; attempt 1; 1800 ticks",
  ];
  const previewPage = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const previewOverlay = await browser.newPage({
    viewport: { width: 1200, height: 675 },
  });
  for (const surface of [previewPage, previewOverlay]) {
    surface.on("pageerror", (error) => errors.push(error.message));
    await surface.routeWebSocket("**", (socket) => {
      const upstream = socket.connectToServer();
      upstream.onMessage((message) => {
        const data = JSON.parse(String(message));
        socket.send(data.type === "forge" ? JSON.stringify(preview) : message);
      });
    });
  }
  await previewPage.goto(`${base}/dashboard/`);
  await previewPage.locator(".forge-cards h4").first().waitFor();
  assert.equal(await previewPage.locator(".forge-cards article").count(), 3);
  assert.match(
    await previewPage.locator(".gate-report").textContent(),
    /determinism/,
  );
  await previewOverlay.goto(`${base}/overlay/`);
  await previewOverlay.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
  );
  if (process.env.CHATFORGE_CAPTURE === "1") {
    await previewPage.screenshot({
      path: resolve("docs/media/m3-dashboard.png"),
    });
    await previewOverlay.screenshot({
      path: resolve("docs/media/m3-overlay.png"),
    });
  }
  if (process.env.CHATFORGE_CAPTURE_M4 === "1") {
    const { captureHudPreview } = await import("./capture-hud-preview.mjs");
    await captureHudPreview(browser, base);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: built dashboard + Forge WS, Normal start/stop, Safe Mode, patch notes, overlay snapshots/HUD, cross-site document allowance and strict API/mutations. No Twitch or AI requests.",
  );
} finally {
  await browser?.close();
  if (!exited) {
    server.kill();
    for (let i = 0; i < 50 && !exited; i++) await delay(100);
  }
  assert.ok(exited, "Owned fixture server stopped");
  await rm(data, { recursive: true, force: true });
}
