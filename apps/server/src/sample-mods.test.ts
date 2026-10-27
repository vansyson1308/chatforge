import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
import { gatekeeper } from "./gatekeeper.js";
it("revalidates all three real M4 soak mods together with the spectacle policy", async () => {
  const host = new ModHost(new World(2026));
  try {
    for (let i = 0; i < 40; i++)
      host.world.joinViewer(`SIM ${i}`, `sim:${i}`, true);
    for (const n of [1, 2, 3]) {
      const id = `m4-soak-${n}`,
        base = new URL(
          `../../../docs/media/sample-mods/${id}`,
          import.meta.url,
        );
      const source = await readFile(new URL(base.href + ".js"), "utf8");
      const saved = JSON.parse(
        await readFile(new URL(base.href + ".json"), "utf8"),
      );
      const report = await gatekeeper({
        modId: id,
        source,
        checkpoint: host.checkpoint(),
        commands: saved.card.commands,
        spectacle: true,
      });
      expect(report, JSON.stringify(report)).toMatchObject({
        ok: true,
        spectacle: { score: 10 },
      });
      await host.load(id, source);
      for (let tick = 0; tick < 300; tick++) {
        host.tick();
        host.world.drainFx();
      }
      expect(host.diagnostics).toEqual([]);
    }
  } finally {
    host.dispose();
  }
}, 30000);
it("revalidates both real generated artifacts together and proves the healing acceptance", async () => {
  const host = new ModHost(new World(2026));
  try {
    for (const id of ["forge-1-6", "forge-1-8"]) {
      const source = await readFile(
        new URL(`../../../docs/media/sample-mods/${id}.js`, import.meta.url),
        "utf8",
      );
      const report = await gatekeeper({
        modId: id,
        source,
        checkpoint: host.checkpoint(),
        commands: [],
      });
      expect(report.ok, JSON.stringify(report)).toBe(true);
      await host.load(id, source);
    }
    const hero = host.world.joinViewer("Injured", "simulator:injured", true)!;
    hero.hp = 40;
    hero.maxHp = 100;
    host.dispatch({ type: "wave_end", wave: 1 });
    host.tick();
    expect(hero.hp).toBe(45);
    host.dispatch({ type: "twitch:cheer", count: 100, viewer: "Cheerer" });
    const effects = host.world.drainFx();
    expect(
      effects.some((f) => f.modId === "forge-1-6" && f.type === "shake"),
    ).toBe(true);
    expect(
      effects.some((f) => f.modId === "forge-1-8" && f.type === "particles"),
    ).toBe(true);
  } finally {
    host.dispose();
  }
});
