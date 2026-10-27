import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => console.error("Overlay error:", error));
  await page.goto("http://127.0.0.1:5173/?mode=full");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 14; i++) await page.keyboard.press("j");
  await page.waitForTimeout(1800);
  await mkdir("docs/media", { recursive: true });
  await page.screenshot({ path: "docs/media/forge-keep-full.png" });
  await page.keyboard.press("s");
  await page.waitForTimeout(650);
  await page.screenshot({ path: "docs/media/forge-keep-meteor.png" });
  console.log("Saved full-mode and meteor screenshots to docs/media/.");
} finally {
  await browser.close();
}
