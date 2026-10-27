import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

// Run only after other ChatForge Builders stop: WorkspaceBuilder owns a shared
// runtime workspace. This paid drill kills only a verified child of this server.
assert.equal(process.platform, "win32", "This process drill requires Windows");
const portProbe = createServer();
await new Promise((resolvePromise, reject) =>
  portProbe.once("error", reject).listen(3099, "127.0.0.1", resolvePromise),
);
await new Promise((resolvePromise, reject) =>
  portProbe.close((error) => (error ? reject(error) : resolvePromise())),
);
const tmp = resolve("runtime/tmp");
await mkdir(tmp, { recursive: true });
const data = await mkdtemp(join(tmp, "codex-kill-"));
const base = "http://localhost:3099";
const server = spawn(process.execPath, ["dist/apps/server/src/main.js"], {
  cwd: resolve("apps/server"),
  env: {
    ...process.env,
    PORT: "3099",
    CHAT_SOURCE: "simulator",
    SIM_INTENSITY: "normal",
    CHATFORGE_RUNTIME_DIR: data,
    TEMP: tmp,
    TMP: tmp,
  },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true,
});
let exited = false;
server.once("exit", () => {
  exited = true;
});
function childCodex() {
  const script = `$p = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${server.pid} -and $_.Name -eq 'codex.exe' }; $p | Select-Object -ExpandProperty ProcessId`;
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  const pids = output ? output.split(/\s+/).map(Number) : [];
  assert(pids.every((pid) => Number.isSafeInteger(pid) && pid > 0));
  return pids;
}
function killOwnedTree(pid) {
  try {
    execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "pipe",
      windowsHide: true,
    });
  } catch (error) {
    const detail =
      error?.stderr?.toString().trim() || error?.stdout?.toString().trim();
    throw Error(
      `Could not terminate drill-owned Codex: ${detail || "taskkill failed"}`,
    );
  }
}
async function post(name, body = {}) {
  const response = await fetch(`${base}/api/forge/${name}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
}
try {
  for (let n = 0; n < 200; n++) {
    if (exited) throw Error("Drill server exited");
    try {
      await post("start", { preset: "demo" });
      break;
    } catch {
      if (n === 199) throw Error("Drill server did not start");
    }
    await delay(100);
  }
  let killed = false;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (exited) throw Error("Drill server exited unexpectedly");
    const view = await (await fetch(`${base}/api/forge`)).json();
    if (!killed && view.build?.stage === "BUILDING") {
      const children = childCodex();
      if (children.length) {
        assert.equal(
          children.length,
          1,
          "Expected one drill-owned Codex process",
        );
        killOwnedTree(children[0]);
        killed = true;
      }
    }
    if (killed && view.build?.stage === "FAILED") {
      assert.equal(view.mods.length, 0, "Failed build must not deploy a mod");
      assert.match(view.notice, /failed|safe/i);
      const evidence = {
        actualCodexChildKilled: true,
        buildStage: view.build.stage,
        liveGeneratedMods: view.mods.length,
        notice: view.notice,
      };
      await mkdir(resolve("docs/media/soak"), { recursive: true });
      await writeFile(
        resolve("docs/media/soak/codex-kill-drill.json"),
        JSON.stringify(evidence, null, 2),
      );
      console.log("PASS " + JSON.stringify(evidence));
      break;
    }
    await delay(1000);
  }
  assert(killed, "The drill never observed and killed a Codex child");
  const final = await (await fetch(`${base}/api/forge`)).json();
  assert.equal(final.build?.stage, "FAILED", "Killed Codex must fail safely");
} finally {
  try {
    await post("stop");
  } catch {
    /* Already stopped. */
  }
  if (!exited) {
    for (const pid of childCodex()) {
      try {
        killOwnedTree(pid);
      } catch {
        /* Child already exited. */
      }
    }
    server.kill();
    for (let n = 0; n < 100 && !exited; n++) await delay(100);
  }
  assert(exited, "Drill server must stop before cleanup");
  await rm(data, { recursive: true, force: true });
}
