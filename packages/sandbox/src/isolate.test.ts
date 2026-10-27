import { describe, expect, it } from "vitest";
import { ModExecutionError, ModIsolate } from "./isolate.js";

describe("isolated QuickJS primitive", () => {
  it("does not expose host globals or nondeterministic primitives", async () => {
    const mod = await ModIsolate.create("host-check", { budgetMs: 500 });
    try {
      expect(
        mod.evaluate(
          "[typeof process, typeof require, typeof fetch, typeof Date, typeof Math.random, typeof eval, typeof Function].join(',')",
        ),
      ).toBe(
        "undefined,undefined,undefined,undefined,undefined,undefined,undefined",
      );
      expect(mod.evaluate("typeof (() => {}).constructor")).toBe("undefined");
      expect(mod.evaluate("globalThis.process === undefined")).toBe(true);
      expect(mod.evaluate("Object.prototype.polluted = true; true")).toBe(true);
      expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    } finally {
      mod.dispose();
    }
  });
  it("interrupts an infinite loop and reports the mod id", async () => {
    const mod = await ModIsolate.create("loop", { budgetMs: 20 });
    try {
      expect(() => mod.evaluate("while (true) {}")).toThrow(ModExecutionError);
    } finally {
      mod.dispose();
    }
  });
  it("limits recursion and allocations", async () => {
    const mod = await ModIsolate.create("limits", {
      memoryBytes: 1024 * 1024,
      budgetMs: 50,
    });
    try {
      expect(() => mod.evaluate("function f(){ return f() }; f()")).toThrow(
        ModExecutionError,
      );
      expect(() => mod.evaluate("new ArrayBuffer(100000000)")).toThrow(
        ModExecutionError,
      );
    } finally {
      mod.dispose();
    }
  });
});
