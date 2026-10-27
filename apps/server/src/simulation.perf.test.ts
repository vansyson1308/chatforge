import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
import { threadCpuMs } from "../../../packages/sandbox/src/index.js";
it("300 entities + 3 active mods / 900 ticks meets avg, p99 and max gates", async () => {
  const world = new World(2026),
    host = new ModHost(world);
  try {
    for (const id of ["meteor-shower", "slime-king", "aurora-blessing"])
      await host.load(
        id,
        await readFile(
          new URL(`../examples/${id}.js`, import.meta.url),
          "utf8",
        ),
      );
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
    // Warm JIT/QuickJS, then measure every tick including periodic checkpoints and events.
    host.dispatch({ type: "twitch:sub", viewer: "Warmup" });
    host.dispatch({ type: "twitch:raid", viewer: "Warmup" });
    for (let i = 0; i < 120; i++) {
      host.tick();
      world.drainFx();
    }
    const samples: number[] = [];
    const slow: { tick: number; elapsedMs: number; cpuMs: number }[] = [];
    for (let tick = 0; tick < 900; tick++) {
      const start = performance.now();
      const cpuStart = threadCpuMs();
      if (tick % 180 === 0)
        host.dispatch({ type: "twitch:sub", viewer: "Perf" });
      if (tick % 600 === 0)
        host.dispatch({ type: "twitch:raid", viewer: "Perf" });
      host.tick();
      world.drainFx();
      const elapsedMs = performance.now() - start;
      samples.push(elapsedMs);
      if (elapsedMs > 10)
        slow.push({ tick, elapsedMs, cpuMs: threadCpuMs() - cpuStart });
    }
    samples.sort((a, b) => a - b);
    const metrics = {
      avg: samples.reduce((a, b) => a + b, 0) / samples.length,
      p95: samples[Math.ceil(samples.length * 0.95) - 1]!,
      p99: samples[Math.ceil(samples.length * 0.99) - 1]!,
      max: samples.at(-1)!,
    };
    console.log("PERF " + JSON.stringify(metrics));
    if (slow.length)
      console.log(
        "SLOW_TICKS " +
          JSON.stringify(
            slow.sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10),
          ),
      );
    expect(host.diagnostics).toEqual([]);
    expect(world.state.entities.length).toBeGreaterThanOrEqual(300);
    const scale = process.env.CI ? 3 : 1;
    expect(metrics.avg).toBeLessThanOrEqual(3 * scale);
    expect(metrics.p99).toBeLessThanOrEqual(10 * scale);
    expect(metrics.max).toBeLessThanOrEqual(25 * scale);
  } finally {
    host.dispose();
  }
});
