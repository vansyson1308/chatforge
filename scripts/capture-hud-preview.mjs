/* global document */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { World } from "../apps/server/dist/packages/engine/src/index.js";
import { ModHost } from "../apps/server/dist/apps/server/src/mod-host.js";

// Presentation replay only. Actual live-round evidence is captured by soak-forge.mjs.
export async function captureHudPreview(browser, base) {
  const samples = await Promise.all(
    [1, 2, 3].map(async (id) =>
      JSON.parse(
        await readFile(
          resolve(`docs/media/sample-mods/m4-soak-${id}.json`),
          "utf8",
        ),
      ),
    ),
  );
  const host = new ModHost(new World(2026)),
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (let i = 0; i < 20; i++)
      host.world.joinViewer(`SIM Viewer${i}`, `sim:${i}`, true);
    for (const name of ["meteor-shower", "aurora-blessing", "slime-king"])
      await host.load(
        name,
        await readFile(resolve(`apps/server/examples/${name}.js`), "utf8"),
      );
    const view = await (await fetch(base + "/api/forge")).json();
    view.running = true;
    view.build = null;
    view.notice = "LAYOUT REPLAY - saved real mods";
    view.ideas = samples
      .flatMap((s) =>
        s.card.credits.map((c) => ({
          author: c.name,
          source: c.source,
          text: s.card.pitch,
        })),
      )
      .slice(0, 4);
    view.round = {
      id: 999,
      stage: "COLLECTING",
      deadline: Date.now() + 45000,
      startedAt: Date.now(),
      cards: samples.map((s) => s.card),
      tallies: [9, 5, 3],
      winner: null,
      ideaIds: [],
      modId: null,
      attempts: 0,
      durationMs: 0,
      report: null,
    };
    await page.routeWebSocket("**", (socket) => {
      const upstream = socket.connectToServer();
      upstream.onMessage((message) => {
        const data = JSON.parse(String(message));
        if (data.type === "forge") {
          view.now = Date.now();
          socket.send(JSON.stringify(view));
        } else if (data.type === "snapshot") {
          view.now = Date.now();
          socket.send(JSON.stringify(view));
          host.tick();
          const w = host.world.state;
          socket.send(
            JSON.stringify({
              type: "snapshot",
              tick: w.tick,
              wave: w.wave,
              cycle: w.cycle,
              keepHp: w.keepHp,
              entities: w.entities.map((e) => [
                e.id,
                e.kind,
                e.team,
                e.x,
                e.y,
                e.hp,
                e.maxHp,
                e.viewer ?? "",
                e.level,
                e.bornTick ?? 0,
                e.simulated ?? false,
                e.scale ?? 1,
                e.hat ?? "",
              ]),
              fx: host.world.drainFx(),
              sprites: host.sprites(),
            }),
          );
        } else socket.send(message);
      });
    });
    const go = async (suffix) => {
      await page.goto(base + "/overlay/" + suffix);
      await page.evaluate(() => {
        const label = document.createElement("div");
        label.textContent =
          "LAYOUT REPLAY · SAVED REAL MODS · NOT A LIVE ROUND";
        label.style.cssText =
          "position:fixed;top:3px;left:40px;color:#ffbd78;font:18px monospace;z-index:99";
        document.body.append(label);
      });
      await page.waitForFunction(
        () => Number(document.querySelector("canvas")?.dataset.tick) > 10,
      );
    };
    await go("");
    for (const phase of [
      "COLLECTING",
      "VOTING",
      "STREAMER_APPROVAL",
      "BUILDING",
      "TESTING",
      "LIVE",
    ]) {
      if (["COLLECTING", "VOTING", "STREAMER_APPROVAL"].includes(phase)) {
        view.round.stage = phase;
        view.round.winner = phase === "STREAMER_APPROVAL" ? 0 : null;
      } else {
        view.round.stage = "COLLECTING";
        view.build = {
          ...view.round,
          id: 998,
          stage: phase,
          deadline: null,
          winner: 0,
          modId: "preview-1",
          attempts: 1,
          durationMs: samples[0].buildSeconds * 1000,
          report: phase === "BUILDING" ? null : samples[0].report,
        };
        view.activity = [
          "Running local Gatekeeper (exit 0)",
          "Gatekeeper: PASS; 1800 ticks",
        ];
      }
      if (phase === "LIVE") {
        await host.load(
          "preview-1",
          await readFile(
            resolve("docs/media/sample-mods/m4-soak-1.js"),
            "utf8",
          ),
        );
        view.mods = [
          {
            id: "preview-1",
            title: samples[0].card.title,
            credits: samples[0].card.credits,
          },
        ];
        view.patches = view.mods;
      }
      await page.waitForTimeout(phase === "LIVE" ? 3600 : 900);
      await page.screenshot({
        path: resolve(
          `docs/media/hud/layout-preview-${phase.toLowerCase()}.png`,
        ),
      });
    }
    view.build.stage = "IDLE";
    // This is explicitly a layout replay: duplicate saved card metadata under
    // distinct preview IDs to exercise the late-stream keep layout.
    view.patches = Array.from({ length: 12 }, (_, i) => ({
      id: `preview-${i}`,
      title: samples[i % samples.length].card.title,
      credits: samples[i % samples.length].card.credits,
    }));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve("docs/media/hud/layout-preview-twelve-emblems.png"),
    });
    await page.keyboard.press("h");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve("docs/media/hud/layout-preview-hall.png"),
    });
    await go("?mode=overlay&hall=1");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve("docs/media/hud/layout-preview-transparent.png"),
    });
    if (errors.length || host.diagnostics.length)
      throw Error(JSON.stringify({ errors, diagnostics: host.diagnostics }));
    console.log(
      "PASS: final HUD layout replay, clearly labelled; saved real mods execute in QuickJS; no AI/Twitch calls.",
    );
  } finally {
    await page.close();
    host.dispose();
  }
}
