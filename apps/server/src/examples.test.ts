import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";

const source = (name: string) =>
  readFile(new URL(`../examples/${name}.js`, import.meta.url), "utf8");

it("telegraphs and impacts a subscriber-triggered meteor", async () => {
  const world = new World(3);
  const host = new ModHost(world);
  try {
    await host.load("meteor-shower", await source("meteor-shower"));
    host.dispatch({ type: "twitch:sub", viewer: "Ada" });
    const mark = world.state.fx.find((fx) => fx.type === "telegraph");
    expect(mark).toBeDefined();
    const enemy = world.spawn({
      kind: "target",
      team: "enemy",
      x: Number(mark?.x),
      y: Number(mark?.y),
      hp: 100,
      speed: 0,
    });
    for (let i = 0; i < 30; i++) host.tick();
    expect(host.diagnostics).toEqual([]);
    expect(enemy.hp).toBe(40);
    expect(world.state.fx.some((fx) => fx.type === "particles")).toBe(true);
  } finally {
    host.dispose();
  }
});

it("spawns the slime king every fifth wave and splits it on death", async () => {
  const world = new World(3);
  const host = new ModHost(world);
  try {
    await host.load("slime-king", await source("slime-king"));
    host.dispatch({ type: "wave_start", wave: 5 });
    const king = world.state.entities.find(
      (entity) => entity.kind === "slime-king",
    );
    expect(king).toBeDefined();
    if (!king) throw new Error("King missing");
    world.state.tick += 60; // Entrance grace ends before damage is enabled.
    world.damage(king, 1000);
    for (const event of world.drainEvents()) host.dispatch(event);
    expect(
      world.state.entities.filter((entity) => entity.kind === "king-slimelet"),
    ).toHaveLength(4);
    expect(host.sprites()["slime-king"]).toBeDefined();
  } finally {
    host.dispose();
  }
});

it("expires a raid blessing after 600 ticks", async () => {
  const world = new World(3);
  const host = new ModHost(world);
  try {
    await host.load("aurora-blessing", await source("aurora-blessing"));
    host.dispatch({ type: "twitch:raid", viewer: "Ada" });
    expect(world.state.rules.heroDamageMultiplier).toBe(2);
    expect(
      world.state.fx.some(
        (fx) => fx.type === "banner" && String(fx.text).includes("Ada"),
      ),
    ).toBe(true);
    for (let i = 0; i < 600; i++) host.tick();
    expect(world.state.rules.heroDamageMultiplier).toBe(1);
  } finally {
    host.dispose();
  }
});

it("equips the declared weapon and fires its custom projectile with real combat damage", async () => {
  const world = new World(5),
    host = new ModHost(world);
  try {
    await host.load("aurora-blessing", await source("aurora-blessing"));
    const hero = world.spawn({
      kind: "hero",
      team: "hero",
      x: 100,
      y: 510,
      speed: 0,
      hp: 1000,
    });
    const enemy = world.spawn({
      kind: "target",
      team: "enemy",
      x: 180,
      y: 510,
      speed: 0,
      hp: 1000,
      damage: 0,
    });
    host.dispatch({ type: "twitch:raid", viewer: "Ada" });
    expect(hero.weapon).toBe("aurora-staff");
    host.tick();
    expect(world.state.entities.some((e) => e.kind === "aurora-bolt")).toBe(
      true,
    );
    for (let i = 0; i < 15; i++) host.tick();
    expect(enemy.hp).toBe(976);
    expect(host.sprites()["aurora-bolt"]).toBeDefined();
  } finally {
    host.dispose();
  }
});
