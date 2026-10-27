import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
const sprite =
  "{grid:['ab','cd'],palette:{a:'#ff0000',b:'#00ff00',c:'#0000ff',d:'#ffffff'}}";
it("runs hats, inert props and all v1.1 visual operations only through QuickJS", async () => {
  const host = new ModHost(new World());
  try {
    const hero = host.world.joinViewer("SIM Ada")!;
    await host.load(
      "visual",
      `export function register(api){
      api.defineHat('crown',${sprite});api.defineProp('lantern',{sprite:${sprite},scale:99});
      api.on('twitch:sub',()=>{api.equipHat(${hero.id},'crown');api.spawn('lantern',400,400);
        api.fx.text(600,400,'hello');api.fx.ring(600,500,999,'#ffffff',999);api.fx.beam(0,0,600,500,'#ffffff',999);
        api.fx.lightning(0,0,600,500);api.fx.flash('#ffffff',999);api.fx.trail(${hero.id},'#ffffff',999);api.fx.sky('aurora',999);api.sfx('anvil');
      });}`,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(host.world.byId.get(hero.id)?.hat).toBe("crown");
    const prop = host.world.state.entities.find((e) => e.kind === "lantern")!;
    expect(prop).toMatchObject({ team: "prop", scale: 4, speed: 0, damage: 0 });
    const fx = host.world.drainFx();
    expect(fx.find((e) => e.type === "ring")).toMatchObject({
      radius: 250,
      ticks: 180,
    });
    expect(fx.find((e) => e.type === "flash")).toMatchObject({ ticks: 30 });
    expect(fx.find((e) => e.type === "sky")).toMatchObject({ ticks: 900 });
    expect(
      ["text", "beam", "lightning", "trail", "sfx"].every((type) =>
        fx.some((e) => e.type === type),
      ),
    ).toBe(true);
    for (let i = 0; i < 100; i++) host.tick();
    expect(host.world.byId.get(prop.id)).toMatchObject({
      x: 400,
      y: 400,
      hp: 1,
    });
    expect(host.diagnostics).toEqual([]);
  } finally {
    host.dispose();
  }
});
it.each([
  "api.fx.sky('internet',3)",
  "api.sfx('external-url')",
  "api.fx.flash('url(x)',3)",
  "api.fx.ring(0/0,0,20,'#ffffff',30)",
  "api.equipHat(1,'foreign-hat')",
])("rolls back invalid visual operations: %s", async (operation) => {
  const host = new ModHost(new World());
  try {
    host.world.joinViewer("Ada");
    const hash = host.world.hash();
    await host.load(
      "bad",
      `export function register(api){api.on('twitch:sub',()=>{api.fx.text(0,0,'must not leak');${operation};});}`,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(host.diagnostics).toHaveLength(1);
    expect(host.world.hash()).toBe(hash);
  } finally {
    host.dispose();
  }
});
it("gives forged creatures a two-second noncombat entrance, then normal damage", async () => {
  const host = new ModHost(new World());
  try {
    await host.load(
      "creature",
      `export function register(api){api.defineEnemy('crab',{sprite:${sprite},hp:40,speed:1,damage:4,behavior:'chase'});api.on('twitch:sub',()=>api.spawn('crab',600,500));}`,
    );
    host.dispatch({ type: "twitch:sub" });
    const crab = host.world.state.entities[0]!;
    host.world.damage(crab, 500);
    expect(crab.hp).toBe(40);
    host.world.state.tick += 60;
    host.world.damage(crab, 40);
    expect(crab.hp).toBe(0);
  } finally {
    host.dispose();
  }
});
