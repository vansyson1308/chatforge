import { expect, it } from "vitest";
import { ModRuntime } from "./mod-runtime.js";
it("declares callbacks and restores only JSON state across realms", async () => {
  const calls: unknown[][] = [];
  const mod = await ModRuntime.load(
    "test",
    `export function register(api) {
    api.on('twitch:sub', event => { api.state.count = (api.state.count || 0)+1; api.fx.banner(event.viewer); });
    api.every(2, () => api.log('timer'));
    api.onSchedule('later', payload => api.log(payload.text));
    api.registerCommand('!go', (viewer,args) => api.log(viewer+':'+args), {cooldownSec:1});
  }`,
    (_id, op, args) => {
      calls.push([op, ...args]);
      return null;
    },
    { budgetMs: 500 },
  );
  try {
    expect(mod.declarations.intervals).toEqual([2]);
    expect(mod.declarations.commands["!go"]).toBe(30);
    mod.restore({ count: 8 });
    expect(mod.invoke("event", "twitch:sub", { viewer: "Ada" }, 500)).toEqual({
      count: 9,
    });
    mod.invoke("command", "!go", { viewer: "Ada", args: "now" }, 500);
    mod.invoke("timer", 0, null, 500);
    mod.invoke("schedule", "later", { text: "saved payload" }, 500);
    expect(calls).toEqual([
      ["fx.banner", "Ada"],
      ["log", "Ada:now"],
      ["log", "timer"],
      ["log", "saved payload"],
    ]);
  } finally {
    mod.dispose();
  }
});
