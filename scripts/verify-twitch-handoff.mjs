/* global document, location, WebSocket, setTimeout, clearTimeout */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

// Requires pnpm build + pnpm start. Never follows Twitch redirects or sends chat.
const base = "http://localhost:3000";
const login = await fetch(`${base}/auth/twitch/login`, { redirect: "manual" });
assert.equal(login.status, 302);
const target = new URL(login.headers.get("location"));
assert.equal(target.origin, "https://id.twitch.tv");
assert.equal(target.pathname, "/oauth2/authorize");
assert.equal(target.searchParams.get("response_type"), "code");
assert.equal(
  target.searchParams.get("redirect_uri"),
  `${base}/auth/twitch/callback`,
);
const scopes = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "channel:read:subscriptions",
  "bits:read",
  "moderator:read:followers",
];
assert.deepEqual(target.searchParams.get("scope").split(" "), scopes);
assert.match(target.searchParams.get("state"), /^[a-f0-9]{64}$/);
assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
console.log(
  "OAuth redirect: PASS; correct host, code flow, callback, six scopes and browser-bound state. Redirect not followed.",
);
const foreign = await fetch(`${base}/api/status`, {
  headers: { Origin: "https://foreign.invalid" },
});
assert.equal(foreign.status, 403);
const forged = await fetch(
  `${base}/auth/twitch/callback?code=fake&state=forged`,
);
assert.equal(forged.status, 400);
const initial = await (await fetch(`${base}/api/status`)).json();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto(`${base}/dashboard/`);
  await page.getByRole("heading", { name: "Twitch connection" }).waitFor();
  await page.getByLabel("Source", { exact: true }).selectOption("simulator");
  await page
    .getByRole("status")
    .filter({ hasText: "Settings applied" })
    .waitFor();
  await page.getByLabel("Intensity", { exact: true }).selectOption("hype");
  await page.waitForFunction(
    () => document.querySelectorAll(".feed .tag").length > 3,
  );
  assert.match(await page.locator(".feed").first().textContent(), /SIM/);
  const overlay = await browser.newPage();
  overlay.on("pageerror", (error) => errors.push(error.message));
  await overlay.goto(`${base}/overlay/`);
  await overlay.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.entities) > 0,
  );
  const proof = await overlay.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(Error("No SIM snapshot"));
        }, 10000);
        let simulated = false;
        ws.onmessage = (event) => {
          const snapshot = JSON.parse(event.data);
          if (snapshot.type !== "snapshot") return;
          if (snapshot.entities.some((entity) => entity[10] === true)) {
            simulated = true;
            ws.send("mutation attempt");
          }
        };
        ws.onclose = (event) => {
          clearTimeout(timeout);
          resolve({ simulated, code: event.code });
        };
      }),
  );
  assert.deepEqual(proof, { simulated: true, code: 1008 });
  assert.deepEqual(errors, []);
  console.log(
    "Browser: PASS; React dashboard, live SIM log, source/intensity controls, built overlay snapshots, SIM provenance, read-only WebSocket, foreign-origin rejection, forged-state rejection. No real Twitch messages sent.",
  );
} finally {
  await browser.close();
  await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(initial.config),
  });
}
