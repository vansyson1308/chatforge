import { expect, it, vi } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
import { goodMod } from "./forge-fixtures.js";
const sprite = `{grid:['aa'],palette:{a:'#ff8800'}}`;
it("retirement removes owned gear and never resurrects a retired mod on rollback or restart", async () => {
  const host = new ModHost(new World(7)),
    restored = new ModHost(new World(8));
  try {
    await host.load("seed", "export function register(api){}");
    host.markBaseline();
    await host.load("older", goodMod);
    await host.load(
      "newer",
      goodMod
        .replaceAll("armageddon-duck", "newer-duck")
        .replaceAll("!spark", "!newer"),
    );
    host.retire("older");
    expect(Object.keys(host.world.state.mods)).toEqual(["seed", "newer"]);
    restored.importCheckpoint(host.exportCheckpoint());
    restored.rollback("newer");
    expect(Object.keys(restored.world.state.mods)).toEqual(["seed"]);
    expect(
      restored.world.state.entities.some((e) => e.tags.includes("mod:older")),
    ).toBe(false);
  } finally {
    host.dispose();
    restored.dispose();
  }
});
const original = `export function register(api) {
 api.defineEnemy('ember',{sprite:${sprite},hp:10,speed:1,damage:2,behavior:'chase'});
 api.onSchedule('later', p => { api.state.count = (api.state.count || 0)+p.n; api.spawn('ember',300,500); });
 api.on('twitch:sub',()=>api.schedule('later',7,{n:2}));
 api.every(5,()=>{api.state.beats=(api.state.beats||0)+1;});
 api.registerCommand('!go',()=>api.spawn('ember',100,200),{cooldownSec:2});
}`;
it("restores full-world hash and deterministic continuation after a bad deployment", async () => {
  const world = new World(42),
    host = new ModHost(world),
    control = new ModHost(new World(1));
  try {
    await host.load("test", original);
    world.joinViewer("Ada");
    for (let i = 0; i < 8; i++) host.tick();
    host.dispatch({ type: "twitch:sub" });
    host.command("!go", "Ada", "");
    const checkpoint = host.checkpoint(),
      hash = world.hash();
    control.restore(checkpoint);
    await host.load(
      "test",
      `export function register(api){api.on('twitch:sub',()=>{api.rules.set('waveSize',99);api.fx.banner('discard');api.random();api.schedule('bad',5,{});throw Error('broken');});api.onSchedule('bad',()=>{});}`,
    );
    for (let i = 0; i < 3; i++) host.tick();
    host.dispatch({ type: "twitch:sub" });
    expect(world.hash()).toBe(hash);
    expect(host.diagnostics[0]?.modId).toBe("test");
    expect(host.diagnostics[0]?.stack).toBeTruthy();
    for (let i = 0; i < 90; i++) {
      host.tick();
      control.tick();
    }
    expect(world.hash()).toBe(control.world.hash());
    expect(world.state.mods.test?.state.beats).toBe(19);
  } finally {
    host.dispose();
    control.dispose();
  }
});
it("checkpoints scheduled payloads, repeating phase, cooldowns and mod sets for restart", async () => {
  const host = new ModHost(new World(123)),
    restored = new ModHost(new World(2));
  try {
    await host.load("test", original);
    for (let i = 0; i < 3; i++) host.tick();
    host.dispatch({ type: "twitch:sub" });
    host.command("!go", "Ada", "");
    const checkpoint = JSON.parse(JSON.stringify(host.checkpoint()));
    restored.restore(checkpoint);
    host.command("!go", "Ada", "");
    restored.command("!go", "Ada", "");
    for (let i = 0; i < 60; i++) {
      host.tick();
      restored.tick();
    }
    expect(restored.world.hash()).toBe(host.world.hash());
    expect(host.world.state.mods.test?.state.count).toBe(2);
  } finally {
    host.dispose();
    restored.dispose();
  }
});
it("discarded buffers cannot leak RNG, damage, spawns or schedules even if budget errors are caught", async () => {
  const world = new World(1),
    host = new ModHost(world);
  try {
    world.joinViewer("Ada");
    const hash = world.hash();
    await host.load(
      "flood",
      `export function register(api){api.on('twitch:sub',()=>{api.random();api.query({team:'hero'})[0].damage(20);for(let i=0;i<300;i++){try{api.fx.banner('flood');}catch{}}});}`,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(world.hash()).toBe(hash);
    expect(host.diagnostics[0]?.message).toMatch(/budget/i);
  } finally {
    host.dispose();
  }
});
it("hot replacement and unload remove owned definitions and entities", async () => {
  const host = new ModHost(new World(1));
  try {
    await host.load("test", original);
    host.command("!go", "Ada", "");
    await host.load(
      "test",
      `export function register(api){api.on('twitch:sub',()=>api.fx.banner('new'));}`,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(host.world.state.fx.some((f) => f.text === "new")).toBe(true);
    expect(host.sprites().ember).toBeUndefined();
    host.unload("test");
    expect(host.world.state.entities).toHaveLength(0);
    expect(host.world.state.mods).toEqual({});
  } finally {
    host.dispose();
  }
});

it("does not deep-copy or hash the world on ordinary ticks/callbacks", async () => {
  const host = new ModHost(new World(7));
  try {
    await host.load("test", original);
    const snapshot = vi.spyOn(host.world, "snapshot"),
      hash = vi.spyOn(host.world, "hash");
    for (let i = 0; i < 299; i++) host.tick();
    expect(snapshot).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    host.tick();
    expect(snapshot).toHaveBeenCalledTimes(1);
  } finally {
    host.dispose();
  }
});
it("rolls back every mod state and rules, not just the failing mod", async () => {
  const host = new ModHost(new World(7)),
    control = new ModHost(new World(1));
  try {
    await host.load("test", original);
    await host.load(
      "other",
      `export function register(api){api.every(2,()=>{api.state.n=(api.state.n||0)+1;api.rules.set('waveSize',api.state.n);});}`,
    );
    for (let i = 0; i < 7; i++) host.tick();
    const checkpoint = host.checkpoint();
    control.restore(checkpoint);
    await host.load(
      "bad",
      `export function register(api){api.on('twitch:sub',()=>{api.rules.set('waveSize',99);throw Error('failed deploy');});}`,
    );
    for (let i = 0; i < 9; i++) host.tick();
    host.dispatch({ type: "twitch:sub" });
    expect(host.world.hash()).toBe(control.world.hash());
    for (let i = 0; i < 30; i++) {
      host.tick();
      control.tick();
    }
    expect(host.world.hash()).toBe(control.world.hash());
  } finally {
    host.dispose();
    control.dispose();
  }
});

it("bounds projectiles produced by extreme custom weapons to the owning mod budget", async () => {
  const host = new ModHost(new World(7));
  try {
    await host.load(
      "weapon",
      `export function register(api){
   api.defineProjectile('slow',{sprite:${sprite},speed:1,damage:0,lifetime:300});
   api.defineHeroWeapon('rapid',{damage:0,range:500,cooldown:1,projectile:'slow'});
   api.on('twitch:raid',()=>{for(const h of api.query({team:'hero'}))h.equip('rapid');});
  }`,
    );
    for (let i = 0; i < 10; i++)
      host.world.spawn({
        kind: "hero",
        team: "hero",
        x: 100,
        y: 470 + i * 10,
        hp: 10000,
        speed: 0,
      });
    host.world.spawn({
      kind: "target",
      team: "enemy",
      x: 400,
      y: 510,
      hp: 100000,
      speed: 0,
      damage: 0,
    });
    host.dispatch({ type: "twitch:raid" });
    for (let i = 0; i < 60; i++) host.tick();
    const projectiles = host.world.state.entities.filter((e) =>
      e.tags.includes("mod:weapon"),
    );
    expect(projectiles.length).toBeGreaterThan(80);
    expect(projectiles.length).toBeLessThanOrEqual(100);
    expect(host.diagnostics).toEqual([]);
  } finally {
    host.dispose();
  }
});
it("explicit last-good rollback restores the periodic checkpoint", async () => {
  const host = new ModHost(new World(7));
  try {
    await host.load("test", original);
    for (let i = 0; i < 300; i++) host.tick();
    const hash = host.world.hash();
    for (let i = 0; i < 5; i++) host.tick();
    host.rollbackToLastGood();
    expect(host.world.hash()).toBe(hash);
  } finally {
    host.dispose();
  }
});

it("a failure in an older mod restores its own deployment checkpoint, removing later changes too", async () => {
  const host = new ModHost(new World(19));
  try {
    const before = host.world.hash();
    await host.load(
      "older",
      `export function register(api){api.on('twitch:sub',()=>{throw Error('old failure');});}`,
    );
    await host.load(
      "newer",
      `export function register(api){api.every(1,()=>api.rules.set('waveSize',99));}`,
    );
    for (let i = 0; i < 10; i++) host.tick();
    host.dispatch({ type: "twitch:sub" });
    expect(host.world.hash()).toBe(before);
    expect(host.world.state.mods).toEqual({});
  } finally {
    host.dispose();
  }
});
