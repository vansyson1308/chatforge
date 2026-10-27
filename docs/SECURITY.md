# Security

## Threat model

Twitch viewers control text, names and events. Generated mod code is untrusted and may try to escape, exhaust CPU/memory, alter host objects, corrupt persisted state or attack the overlay. Developer endpoints are powerful local controls.

The [September 2026 SCRT research](https://blog.scrt.ch/2026/09/22/how-one-twitch-chat-message-became-code-execution-on-a-streamers-pc/) demonstrated overlay XSS chained with a Chromium vulnerability. ChatForge renders all viewer-originated strings with canvas `fillText` or DOM `textContent`, never `innerHTML`.

## M1 boundaries

- Server binds `127.0.0.1`. Dev mutations require JSON and an allowed localhost Vite Origin; disabled in production. `/dev/populate` is a bounded performance fixture (1–300 durable heroes), not a remote spawning API. The read-only WebSocket sends render fields only.
- Simulation runs in a Node worker. Each mod runs in a separate QuickJS runtime with no module loader, host globals, network, filesystem or native timers. `process`, `require`, `fetch`, DOM, Buffer and host global objects are absent. Static imports fail; pending asynchronous jobs/dynamic imports are rejected without execution.
- Date, Math.random, eval and function constructors (including async/generator constructor paths) are disabled. Mod runtime intrinsic objects/prototypes and control entry points are frozen. The bridge is captured and removed from the guest global object.
- The bridge exchanges bounded JSON strings. Every host operation validates phase, names, shape, ownership, finite numbers and quotas. Guest values never become host functions. State rejects cycles, accessors, functions, non-finite values, unsafe prototype keys and non-plain objects.
- Runtime limits: 4 MiB memory, 256 KiB stack, 50 ms registration, 20 ms aggregate thread CPU execution per mod per simulation tick (60 ms in noisy CI). The interrupt handler stops runaway bytecode; validated host work is bounded separately (128 writes / 256 calls per invocation). Full limits are in MOD_API.md.
- World mutations, schedules and RNG changes are buffered and commit only after success and state validation. Catching quota errors does not permit partial commit. Failure restores a complete checkpoint and re-registers its source set; errors carry mod ID/message/guest stack outside world state and produce an overlay rollback banner.
- Secrets remain in ignored `.env`; runtime data remains in ignored `runtime/`. The Codex Builder default remains explicit `gpt-6.1-sol` with the machine's ChatGPT login; global Codex config is unchanged.

## Verification and scope

Tests cover process/require/fetch/host globals, static and dynamic import, Function/eval constructor paths, Date/random, infinite loops, recursion, huge allocation, prototype pollution, registration mutations, oversized/non-JSON state, async jobs, cumulative CPU budgets and buffered command/schedule floods. Rollback tests compare the entire pre-deployment hash and deterministic continuation of multiple mods, schedules and cooldowns. Snapshot spies ensure normal ticks do not deep-copy the world.

These are tested isolation boundaries, not a proof against all QuickJS/WASM vulnerabilities. The worker is a responsiveness boundary, not an OS security sandbox. The local user and files under runtime/mods are trusted inputs to deployment; a malicious local program can impersonate allowed HTTP headers. M3 adds Gatekeeper static analysis and admission; M5 adds the broader adversarial audit and failure drills. Browser FPS depends on hardware and is measured locally; CI enforces simulation thresholds on both operating systems.

CPU accounting uses Node 24's [process.threadCpuUsage](https://nodejs.org/docs/latest-v24.x/api/process.html#processthreadcpuusagepreviousvalue), excluding OS descheduling. A secondary wall deadline (at least 250 ms) also bounds each evaluation. Windows CPU timer granularity can overshoot a CPU limit by one OS accounting quantum. Performance gates independently measure real elapsed tick time.
