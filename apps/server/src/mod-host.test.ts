import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";

it("replaces a mod atomically and rolls back an error to the previous version", async () => {
  const world = new World(42);
  const host = new ModHost(world);
  const sprite = `{grid:['aa','aa'],palette:{a:'#ff8800'}}`;
  const original = `export function register(api) {
    api.defineEnemy('ember',{sprite:${sprite},hp:10,speed:1,damage:2,behavior:'chase'});
    api.on('twitch:sub',()=>api.spawn('ember',1,2));
  }`;
  const broken = `export function register(api) {
    api.defineEnemy('replacement',{sprite:${sprite},hp:10,speed:1,damage:2,behavior:'chase'});
    api.on('twitch:sub',()=>{api.spawn('replacement',5,6); throw Error('broken');});
  }`;
  try {
    await host.load("test", original);
    await host.load("test", broken);
    host.dispatch({ type: "twitch:sub" });
    expect(world.state.entities).toHaveLength(0);
    expect(world.state.events.some((event) => event.type === "mod_error")).toBe(
      true,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(world.state.entities.map((entity) => entity.kind)).toEqual([
      "ember",
    ]);
  } finally {
    host.dispose();
  }
});

it("disables a mod that tries to suppress a host budget violation", async () => {
  const world = new World(1);
  const host = new ModHost(world);
  try {
    await host.load(
      "flood",
      `export function register(api) { api.on('twitch:sub', () => {
      for (let i = 0; i < 300; i++) { try { api.fx.banner('flood'); } catch (_) {} }
    }); }`,
    );
    host.dispatch({ type: "twitch:sub" });
    expect(world.state.fx.filter((fx) => fx.text === "flood")).toHaveLength(0);
    expect(world.state.events.some((event) => event.type === "mod_error")).toBe(
      true,
    );
  } finally {
    host.dispose();
  }
});
