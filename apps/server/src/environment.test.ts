import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
const testTempRoot = resolve(process.cwd(), "runtime/tmp");
mkdirSync(testTempRoot, { recursive: true });
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { loadEnvironment } from "./environment.js";
it("uses explicit local credentials instead of a parent tool key, retaining CLI port overrides", () => {
  const dir = mkdtempSync(join(testTempRoot, "chatforge-env-"));
  try {
    const file = join(dir, ".env");
    writeFileSync(file, "OPENAI_API_KEY=local-test-key\nPORT=3000\n");
    const env = { OPENAI_API_KEY: "parent-test-key", PORT: "3999" };
    loadEnvironment(file, env);
    expect(env).toEqual({ OPENAI_API_KEY: "local-test-key", PORT: "3999" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
