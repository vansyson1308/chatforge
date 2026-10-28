/* global document */
import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function captureEvidence(take, timeline) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    for (const [name, url] of [
      ["history", "https://github.com/vansyson1308/chatforge/commits/main/"],
      [
        "prompts",
        "https://github.com/vansyson1308/chatforge/tree/main/brief/prompts",
      ],
      [
        "journey",
        "https://github.com/vansyson1308/chatforge/blob/main/docs/CODEX_JOURNEY.md",
      ],
    ]) {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      if (!response?.ok())
        throw Error(
          `Public GitHub evidence ${name} unavailable: ${response?.status()}`,
        );
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        document.body.style.zoom = "1.3";
      });
      await page.screenshot({ path: join(take, `evidence-${name}.png`) });
    }
    const commits = Number(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    );
    const prompts = (await readdir("brief/prompts")).filter((name) =>
      /^P\d.*\.md$/i.test(name),
    ).length;
    let thread = "Unavailable in local build record";
    try {
      const db = new DatabaseSync("runtime/ideas.sqlite", { readOnly: true });
      try {
        const id = timeline.stages.find((stage) => stage.buildId)?.buildId;
        const value = db
          .prepare(
            "SELECT threadId FROM builds WHERE roundId=? AND threadId IS NOT NULL ORDER BY id DESC LIMIT 1",
          )
          .get(id)?.threadId;
        if (typeof value === "string" && /^[a-z0-9-]{8,100}$/i.test(value))
          thread = value;
      } finally {
        db.close();
      }
    } catch {
      /* A take may be moved away from its original database. */
    }
    await page.setContent(
      "<!doctype html><html><head><style>body{margin:0;background:#101e2d;color:#f5e8d4;font:32px Segoe UI, sans-serif;padding:90px}h1{color:#ffb65b;font: bold 72px Consolas,monospace}p{margin:30px 0}.muted{color:#b8c9d2;font-size:26px}</style></head><body><h1>BUILT WITH CODEX</h1><div id='stats'></div></body></html>",
    );
    await page.evaluate(
      ({ commits, prompts, thread }) => {
        const container = document.getElementById("stats");
        for (const text of [
          `${commits} repository commits \u2022 ${prompts} lead prompts`,
          "249 tests verified in the latest local suite",
          "21 real builds LIVE in the 45-minute SIM soak",
          "40.3 s median build in the 3-round Twitch + SIM verification",
          `Codex SDK build thread: ${thread}`,
        ]) {
          const line = document.createElement("p");
          line.textContent = text;
          container.append(line);
        }
        const foot = document.createElement("p");
        foot.className = "muted";
        foot.textContent =
          "Figures describe the documented runs, not a guarantee for future builds.";
        container.append(foot);
      },
      { commits, prompts, thread },
    );
    await page.screenshot({ path: join(take, "evidence-stats.png") });
  } finally {
    await browser.close();
  }
}
