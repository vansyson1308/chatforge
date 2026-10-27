import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = "http://localhost:3098";
const baseline = resolve("runtime/tmp/live-window-baseline.json");
const metrics = await (await fetch(`${base}/api/metrics`)).json();
const view = await (await fetch(`${base}/api/forge`)).json();
assert(
  view.mods.length >= 15,
  "The real stream must have at least 15 live mods",
);
if (process.argv[2] === "start") {
  await mkdir(resolve("runtime/tmp"), { recursive: true });
  await writeFile(
    baseline,
    JSON.stringify({
      at: Date.now(),
      bins: metrics.tickBins,
      mods: view.mods.length,
    }),
  );
  console.log(
    `Started live tick window with ${view.mods.length} generated mods.`,
  );
} else if (process.argv[2] === "finish") {
  const start = JSON.parse(await readFile(baseline, "utf8"));
  const bins = metrics.tickBins.map((n, i) => n - start.bins[i]);
  assert(
    bins.every((n) => n >= 0),
    "Server restarted during measurement",
  );
  const count = bins.reduce((a, b) => a + b, 0);
  assert(count >= 300, "Need at least one posted 300-tick histogram batch");
  let accumulated = 0,
    p99UpperMs = null;
  for (let i = 0; i < bins.length; i++) {
    accumulated += bins[i];
    if (accumulated >= Math.ceil(count * 0.99)) {
      p99UpperMs = (i + 1) / 10;
      break;
    }
  }
  const result = {
    startedAt: new Date(start.at).toISOString(),
    finishedAt: new Date().toISOString(),
    seconds: (Date.now() - start.at) / 1000,
    liveGeneratedModsStart: start.mods,
    liveGeneratedModsEnd: view.mods.length,
    ticks: count,
    tickP99UpperMs: p99UpperMs,
    scope:
      "host.tick only; 0.1 ms histogram bins; excludes separate checkpoint and message handling",
  };
  await writeFile(
    resolve("docs/media/soak/live-15-plus.json"),
    JSON.stringify(result, null, 2),
  );
  await unlink(baseline);
  console.log(JSON.stringify(result));
} else throw Error("Use start or finish");
