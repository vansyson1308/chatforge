import { expect, it } from "vitest";
import { ModRuntime } from "./mod-runtime.js";

it("dispatches events, bounded timers and command cooldowns through JSON host bindings", async () => {
  const calls: unknown[][] = [];
  const mod = await ModRuntime.load(
    "test",
    `export function register(api) {
    api.state.count = 0;
    api.on('twitch:sub', event => { api.state.count++; api.fx.banner(event.viewer); });
    api.after(2, () => api.log('timer'));
    api.registerCommand('!go', (viewer, args) => api.log(viewer + ':' + args), {cooldownSec: 1});
  }`,
    (_id, op, args) => {
      calls.push([op, ...args]);
      return null;
    },
    { budgetMs: 500 },
  );
  try {
    mod.event({ type: "twitch:sub", viewer: "Ada" });
    expect(mod.state()).toEqual({ count: 1 });
    expect(mod.command("!go", "Ada", "now")).toBe(true);
    expect(mod.command("!go", "Ada", "now")).toBe(false);
    mod.event({ type: "tick" });
    mod.event({ type: "tick" });
    expect(calls).toEqual([
      ["fx.banner", "Ada"],
      ["log", "Ada:now"],
      ["log", "timer"],
    ]);
  } finally {
    mod.dispose();
  }
});
