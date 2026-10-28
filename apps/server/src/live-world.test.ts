import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import {
  healWorld,
  invariantFailure,
} from "../../../packages/engine/src/invariants.js";
import { ModHost } from "./mod-host.js";
import { gatekeeper } from "./gatekeeper.js";
import { goodMod } from "./forge-fixtures.js";
const source = (name: string) =>
  readFile(new URL(`../examples/${name}.js`, import.meta.url), "utf8");
it("culls escaped legacy projectiles and reports exact baseline faults without blaming a candidate", async () => {
  const world = new World();
  world.spawn({
    kind: "aurora-bolt",
    team: "projectile",
    x: 500,
    y: -201,
    lifetime: 3,
  });
  const report = await gatekeeper({
    modId: "candidate",
    source: "",
    checkpoint: world.snapshot(),
    commands: [],
    baselineOnly: true,
  });
  expect(report.hostFailure).toBe(true);
  expect(report.checks[0]!.detail).toMatch(/entity=1 kind=aurora-bolt y=-201/);
  expect(healWorld(world.state)).toHaveLength(1);
  expect(invariantFailure(world.state)).toBeUndefined();
  const bolt = world.spawn({
    kind: "bolt",
    team: "projectile",
    x: 500,
    y: -199,
    lifetime: 90,
  });
  bolt.vy = -10;
  world.tick();
  expect(world.byId.has(bolt.id)).toBe(false);
});
it("admits spectacular candidates on a five-minute busy live world with 40 heroes and three mods", async () => {
  const host = new ModHost(new World(2026));
  try {
    for (const name of ["meteor-shower", "aurora-blessing", "slime-king"])
      await host.load(name, await source(name));
    for (let i = 0; i < 40; i++) {
      const hero = host.world.joinViewer(`SIM ${i}`, `sim:${i}`, true)!;
      hero.hp = hero.maxHp = 10000;
    }
    for (let tick = 0; tick < 9000; tick++) {
      if (tick % 300 === 0)
        host.dispatch({ type: "twitch:raid", viewer: "SIM captain" });
      host.tick();
      host.world.drainFx();
    }
    expect(host.diagnostics).toEqual([]);
    expect(host.world.state.tick).toBe(9000);
    expect(
      host.world.state.entities.filter((e) => e.team === "hero"),
    ).toHaveLength(40);
    expect(invariantFailure(host.world.state)).toBeUndefined();
    host.world.state.wave = 8; // Reproduce the QC's wave while retaining accumulated live state.
    for (const [name, command] of [
      ["rubber-duck-armageddon", "!quack"],
      ["dragon-raid-ally", "!dragon"],
    ]) {
      const report = await gatekeeper({
        modId: name!,
        source: await source(name!),
        checkpoint: host.checkpoint(),
        commands: [command!],
        spectacle: true,
      });
      expect(report, JSON.stringify(report)).toMatchObject({
        ok: true,
        spectacle: { score: 10 },
      });
    }
  } finally {
    host.dispose();
  }
}, 60000);
it("rejects particles-only output at the spectacle gate", async () => {
  const report = await gatekeeper({
    modId: "subtle",
    source:
      "export function register(api){api.registerCommand('!tiny',()=>api.fx.particles(500,500,'#ffffff',3),{cooldownSec:1})} export const forgeTest={commands:['!tiny'],expect:{fx:['particles']}}",
    checkpoint: new World().snapshot(),
    commands: ["!tiny"],
    spectacle: true,
  });
  expect(report.ok).toBe(false);
  expect(report.checks.at(-1)!.detail).toContain("Too subtle");
});
it("requires canonical simulated attribution in generated banners", async () => {
  const input = {
    modId: "credited",
    checkpoint: new World().snapshot(),
    commands: ["!spark"],
    spectacle: true,
    credits: [{ id: "s1", name: "Ada", source: "simulator" as const }],
  };
  const wrong = await gatekeeper({
    ...input,
    source: goodMod.replace("forged by the community", "@Ada"),
  });
  expect(wrong.ok).toBe(false);
  expect(wrong.checks.at(-1)?.detail).toContain("Credit banner missing");
  const right = await gatekeeper({
    ...input,
    source: goodMod.replace("forged by the community", "@Ada (SIM)"),
  });
  expect(right.ok, JSON.stringify(right)).toBe(true);
  const repeated = await gatekeeper({
    ...input,
    source: goodMod.replace("forged by the community", "@Ada (SIM) and @Ada"),
  });
  expect(repeated.ok).toBe(false);
  expect(repeated.checks.at(-1)?.detail).toContain("must be followed by (SIM)");
}, 30000);
it("rejects a main sequence that starts itself before the showcase", async () => {
  const source = goodMod.replace(
    "api.registerCommand('!spark', begin",
    "api.every(30, () => { if (!api.state.introduced) { api.state.introduced = true; begin(); } });\n  api.registerCommand('!spark', begin",
  );
  const report = await gatekeeper({
    modId: "showcase-check",
    source,
    checkpoint: new World().snapshot(),
    commands: ["!spark"],
    spectacle: true,
  });
  expect(report.ok).toBe(false);
  expect(report.checks.at(-1)?.detail).toContain(
    "Main showcase sequence fired during idle",
  );
});
it("rejects a showcase that cannot be repeated after its declared cooldown", async () => {
  const source = goodMod
    .replace("api.state.active = false;", "api.state.active = true;")
    .replace(
      "if (api.state.active) { api.fx.ring(600,510,100,'#ffd347',30); return; }",
      "if (api.state.active) return;",
    );
  const report = await gatekeeper({
    modId: "showcase-repeat",
    source,
    checkpoint: new World().snapshot(),
    commands: ["!spark"],
    spectacle: true,
  });
  expect(report.ok).toBe(false);
  expect(report.checks.at(-1)?.detail).toContain("Showcase trigger 2");
});
it("marches waves along the ground, damages/rebuilds the keep and presents a fifth-wave boss", () => {
  const world = new World(77);
  world.state.wave = 4;
  world.state.pendingEnemies = 0;
  world.tick();
  world.tick();
  expect(world.state.entities.some((e) => e.kind === "slime-king")).toBe(true);
  let damaged = false,
    fallen = false;
  for (let n = 0; n < 3000; n++) {
    world.tick();
    damaged ||= world.state.keepHp < 100;
    fallen ||= world.state.cycle > 1;
  }
  expect(damaged).toBe(true);
  expect(fallen).toBe(true);
  expect(
    world.state.entities
      .filter((e) => e.team === "enemy")
      .every((e) => e.y >= 455 && e.y <= 610),
  ).toBe(true);
});
