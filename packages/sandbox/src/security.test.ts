import { expect, it } from "vitest";
import { ModIsolate } from "./isolate.js";
it.each([
  "process.env",
  "require('node:fs')",
  "fetch('https://example.com')",
  "globalThis.process.env",
  "Function('return process')()",
  "eval('process')",
  "(()=>{}).constructor('return process')()",
  '(async()=>{}).constructor("return process")()',
  '(function*(){}).constructor("return process")()',
  "new Date()",
  "Math.random()",
])(
  "neutralizes host/dynamic code/nondeterminism attempt: %s",
  async (source) => {
    const mod = await ModIsolate.create("security", { budgetMs: 100 });
    try {
      expect(() => mod.evaluate(source)).toThrow();
    } finally {
      mod.dispose();
    }
  },
);
it("dynamic import cannot load host modules or access host globals", async () => {
  const mod = await ModIsolate.create("dynamic-import", { budgetMs: 100 });
  try {
    expect(
      mod.evaluate(
        "[typeof window,typeof document,typeof Buffer,typeof global,typeof setTimeout,typeof WebSocket].join(',')",
      ),
    ).toBe("undefined,undefined,undefined,undefined,undefined,undefined");
    expect(() =>
      mod.evaluate("import('node:fs').then(m=>globalThis.leak=m)"),
    ).toThrow(/dynamic import/);
  } finally {
    mod.dispose();
  }
});
