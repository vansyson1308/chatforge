import { describe, expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { gatekeeper, inspectMod } from "./gatekeeper.js";

import { goodMod } from "./forge-fixtures.js";
const contract = "export const forgeTest={expect:{minEffects:1}};";
describe("Gatekeeper admission", () => {
  it("does not count another mod's rule change as a candidate effect", async () => {
    const { ModHost } = await import("./mod-host.js");
    const host = new ModHost(new World());
    try {
      await host.load(
        "existing",
        "export function register(api){api.on('tick',()=>api.rules.set('waveSize',9))}",
      );
      const report = await gatekeeper({
        modId: "borrowed",
        source:
          "export function register(api){api.on('tick',()=>api.rules.set('waveSize',9))} export const forgeTest={expect:{rules:{waveSize:9}}};",
        checkpoint: host.checkpoint(),
        commands: [],
      });
      expect(report.ok).toBe(false);
    } finally {
      host.dispose();
    }
  });
  it("simulates twice from the supplied live checkpoint and verifies candidate effects", async () => {
    const world = new World(37);
    world.joinViewer("Existing", "twitch:1");
    for (let i = 0; i < 12; i++) world.tick();
    const report = await gatekeeper({
      modId: "spark",
      source: goodMod,
      checkpoint: world.snapshot(),
      commands: ["!spark"],
    });
    expect(report, JSON.stringify(report)).toMatchObject({
      ok: true,
      ticks: 1800,
    });
    expect(report.hashes[0]).toBe(report.hashes[1]);
  });
  it.each([
    'import fs from "node:fs"; export function register(api){}',
    'export function register(api){require("fs")}',
    'export function register(api){eval("1")}',
    'export function register(api){Function("1")()}',
    "export async function register(api){}",
    "export function register(api){Promise.resolve(1)}",
    "export function register(api){WebAssembly.compile(1)}",
    "export function register(api){globalThis.process.exit()}",
    'export function register(api){api["constructor"]("1")}',
    'export function register(api){const x="constructor";api[x]()} ',
    "export function register(api){api.__proto__}",
    'export function register(api){Reflect.get(api,"x")}',
    'export function register(api){import("node:fs")}',
    "export function register(api){new Date()}",
    "export function register(api){with(api){}}",
    "export function register(api){ this.process.exit() }",
    "globalThis.x=1; export function register(api){}",
    "export function register(api){",
  ])("rejects forbidden syntax: %s", (source) => {
    expect(() => inspectMod(source + contract)).toThrow();
  });
  it.each([
    `export function register(api){} ${contract}`,
    `export function register(api){api.on("tick",()=>{while(true){}})} ${contract}`,
    `export function register(api){api.on("tick",()=>{throw Error("broken")})} ${contract}`,
    `export function register(api){api.fx.banner("illegal registration")} ${contract}`,
    `export function register(api){api.on("tick",()=>api.log("no effect"))} ${contract}`,
    `export function register(api){api.on("tick",()=>api.rules.set("waveSize",6))} export const forgeTest={expect:{rules:{waveSize:6}}};`,
  ])("rejects broken or non-observable candidate", async (source) => {
    const report = await gatekeeper({
      modId: "bad",
      source,
      checkpoint: new World().snapshot(),
      commands: [],
    });
    expect(report.ok).toBe(false);
  });
  it("does not accept FX from an existing live mod as candidate evidence", async () => {
    const { ModHost } = await import("./mod-host.js");
    const host = new ModHost(new World());
    try {
      await host.load("existing", goodMod);
      const report = await gatekeeper({
        modId: "noop",
        source: `export function register(api){} ${contract}`,
        checkpoint: host.checkpoint(),
        commands: ["!spark"],
      });
      expect(report.ok).toBe(false);
    } finally {
      host.dispose();
    }
  });
});
