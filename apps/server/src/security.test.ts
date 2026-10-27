import { describe, expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";

describe("host boundary security", () => {
  it.each([
    "api.spawn('bad',0,0)",
    "api.fx.banner('bad')",
    "api.rules.set('waveSize',99)",
    "api.schedule('bad',1,{})",
    "api.random()",
    "api.state.bad = 1",
  ])("rejects non-declarations in register: %s", async (code) => {
    const host = new ModHost(new World(1));
    const before = host.world.hash();
    try {
      await expect(
        host.load("attack", `export function register(api){${code}}`),
      ).rejects.toThrow(/register|runtime-only|declaration/i);
      expect(host.world.hash()).toBe(before);
    } finally {
      host.dispose();
    }
  });
  it.each([
    "api.state.big='x'.repeat(20000)",
    "api.state.self=api.state",
    "api.state.bad=()=>1",
    "api.state.bad=Infinity",
    "Object.defineProperty(api.state,'getter',{get(){return 1},enumerable:true})",
    'api.state.bad=JSON.parse(\'{"__proto__":{"polluted":true}}\')',
    "for(let i=0;i<200;i++){try{api.fx.banner('flood')}catch{}}",
    "for(let i=0;i<33;i++){try{api.schedule('later',1,{})}catch{}}",
    "api.every(1,()=>{})",
    "while(true){}",
    "function f(){f()} f()",
    "new ArrayBuffer(100000000)",
    "import('node:fs')",
    "Promise.resolve().then(()=>api.fx.banner('late'))",
    "return Promise.resolve(1)",
    "Object.prototype.polluted=true",
  ])("discards and disables malicious callbacks: %s", async (code) => {
    const host = new ModHost(new World(8));
    const before = host.world.hash();
    try {
      await host.load(
        "attack",
        `export function register(api){api.onSchedule('later',()=>{});api.on('twitch:sub',()=>{api.fx.banner('must not appear');${code}});}`,
      );
      host.dispatch({ type: "twitch:sub" });
      expect(host.diagnostics).toHaveLength(1);
      expect(host.world.hash()).toBe(before);
      expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    } finally {
      host.dispose();
    }
  });
  it("caps cumulative callbacks in one simulation tick", async () => {
    const host = new ModHost(new World(1));
    try {
      await host.load(
        "busy",
        `export function register(api){api.on('twitch:sub',()=>{let n=0;for(let i=0;i<20000;i++)n+=i;api.state.n=n;});}`,
      );
      for (let i = 0; i < 1000 && !host.diagnostics.length; i++)
        host.dispatch({ type: "twitch:sub" });
      expect(host.diagnostics[0]?.message).toMatch(/CPU|interrupted/);
    } finally {
      host.dispose();
    }
  });
  it("protects bridge access and runtime entry points from guest replacement", async () => {
    const host = new ModHost(new World(1));
    try {
      await expect(
        host.load(
          "tamper",
          `export function register(api){globalThis.__forgeRuntime={};}`,
        ),
      ).rejects.toThrow();
      await host.load(
        "check",
        `export function register(api){api.on('twitch:sub',()=>{if(typeof globalThis.__forgeBridge!=='undefined')throw Error('bridge leak');api.state.ok=true;});}`,
      );
      host.dispatch({ type: "twitch:sub" });
      expect(host.world.state.mods.check?.state.ok).toBe(true);
    } finally {
      host.dispose();
    }
  });
});
