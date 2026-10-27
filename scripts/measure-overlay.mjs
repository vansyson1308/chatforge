import { chromium } from "playwright-core";
/* global document, requestAnimationFrame */
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/?mode=full");
  const response = await page.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:3000/dev/populate", {
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
  console.log("OVERLAY_FPS " + JSON.stringify(metrics));
  if (errors.length) throw Error(errors.join("\n"));
  if (metrics.minEntities < 300 || metrics.avgFps < 58 || metrics.p5Fps < 50)
    throw Error("Overlay FPS gate failed");
} finally {
  await browser.close();
}
