import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";

it("runs 30 seconds of 300 entities with three mods within the average tick budget", async () => {
  const world = new World(2026);
  const host = new ModHost(world);
  try {
    for (const id of ["meteor-shower", "slime-king", "aurora-blessing"]) {
      await host.load(
        id,
        await readFile(
          new URL(`../examples/${id}.js`, import.meta.url),
          "utf8",
        ),
      );
    }
    for (let i = 0; i < 300; i++)
      world.spawn({
        kind: i < 150 ? "hero" : "slime",
        team: i < 150 ? "hero" : "enemy",
        x: (i * 97) % 1200,
        y: 120 + ((i * 53) % 450),
        hp: 100000,
        speed: 0.5,
        damage: 1,
      });
    let total = 0,
      max = 0;
    for (let tick = 0; tick < 900; tick++) {
      const start = performance.now();
      host.tick();
      world.drainFx();
      const elapsed = performance.now() - start;
      total += elapsed;
      max = Math.max(max, elapsed);
    }
    const average = total / 900;
    console.log(
      `300 entities / 3 mods / 900 ticks: avg ${average.toFixed(2)} ms, max ${max.toFixed(2)} ms`,
    );
    expect(average).toBeLessThan(1000 / 30);
  } finally {
    host.dispose();
  }
}, 120000);
