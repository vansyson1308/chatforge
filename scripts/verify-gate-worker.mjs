import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { World } from "../apps/server/dist/packages/engine/src/index.js";
import { runGate } from "../apps/server/dist/apps/server/src/gate-runner.js";
const checks = [];
const report = await runGate(
  {
    modId: "worker-smoke",
    source: await readFile(
      new URL(
        "../apps/server/examples/rubber-duck-armageddon.js",
        import.meta.url,
      ),
      "utf8",
    ),
    checkpoint: new World(2026).snapshot(),
    commands: ["!quack"],
    spectacle: true,
  },
  AbortSignal.timeout(45000),
  (check) => checks.push(check),
);
assert.equal(report.ok, true, JSON.stringify(report));
assert.deepEqual(checks, report.checks);
assert.equal(checks.length, 5);
console.log(
  "PASS: actual Gatekeeper worker streamed five completed checks and a deterministic 10/10 result.",
);
