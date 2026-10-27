# Codex journey

## M0 — Harness (2026-10-27)

Requested: establish the seven-package workspace, repeatable Windows/Linux checks, documentation, private GitHub repository and feasibility probes before product work. Built: strict TypeScript/ESM placeholders, lint and test tooling, CI and documented security boundaries. Decisions: pin pnpm 10 via Corepack; leave model IDs unset until verified; make the future end-to-end command explicitly fail until M5 rather than report a false success. Smoke and CI outcomes are reported in the M0 handoff.

Feasibility: Node 24 SQLite and QuickJS evaluated 1 + 1 successfully. The available OpenAI model list includes the current configured candidates. The original SDK reached the existing ChatGPT login but its configured `gpt-6.1-terra` was rejected for that account. Model-list presence alone does not prove suitability or access through Codex login.

M0 closeout: GitHub Actions run 40466127604 passed on Windows and Ubuntu after the repository became public. The original SDK 0.87.0 rejected the requested ChatGPT models; the API-key fallback reported no credits. Upgrading the SDK to 0.164.0 allowed ChatGPT authentication with `gpt-6.1-sol`: thread `01a17c46-b6c6-7be3-aa76-4cc47ba72978` returned `FORGE_OK`. Model availability and auth remain account-dependent. The project now passes the model explicitly without changing global Codex configuration.

## M1 — foundation in progress (2026-10-27)

The lead approved server-authoritative simulation in a Node worker and a snapshot-only overlay; the brief and architecture record that refinement. Initial work adds a seeded, tick-driven world with JSON snapshots and replay tests, a draft typed mod contract and sprite validator, and a QuickJS isolation primitive with bounded JSON host calls and preliminary adversarial tests. This foundation is not yet the M1 product: the worker, validated host bindings, rollback, examples, overlay and full security and performance gates remain to be implemented and verified.

Follow-on M1 work adds an experimental localhost worker/WebSocket loop and Canvas2D overlay, three example mods with tests, per-callback host validation and a tested failed-replacement rollback. Chrome screenshots were captured using the locally installed browser. A local 300-entity/three-mod run measured 10.23 ms average and 36.87 ms maximum per tick; the maximum exceeded the 33.3 ms 30 Hz interval. M1 remains incomplete: full serializable mod state and timer restoration, whole-set rollback, weapon/projectile definitions, comprehensive security coverage and the maximum-tick/overlay frame-rate gates remain open. Arbitrary JavaScript timer closures cannot be reconstructed from JSON state alone; a restart-safe timer contract or a different persistence design must be decided explicitly.

The full test suite under concurrent test load measured 16.56 ms average and a 500.41 ms maximum; the current performance assertion checks the average only, so it does not certify the maximum-tick gate.

## 2026-10-27 — M1 lead QC completion

Lead reviewed b752175/13414a4 and approved command buffers, spatial indexing, compact render snapshots, named persistent schedules and explicit performance gates. The original prompts are now tracked under `brief/prompts/` as part of the build story.

Implemented validated per-call command buffers (including RNG and schedules) and complete deployment checkpoint restoration. Mod state, sources/version, repeating phases, named schedules and command cooldowns survive JSON round trips. Rollback tests compare the full pre-deploy hash and deterministic continuation, including multiple mods and failure in an older mod after a later deployment. Bounded deployment history selects the failing version's own checkpoint rather than partially unloading it from another version's world. Snapshot spies prove ordinary ticks/callbacks do not copy the world.

Completed projectile/weapon definitions and equip handles; Aurora grants a custom staff while its raid damage buff lasts 600 ticks. Enforced projectile ownership quotas as well as enemy quotas. Added uniform-grid target/collision queries, an ID map, separation steering, loot/progression and distinct behaviors. The worker now sends Zod-validated render-only tuples at 20 Hz. Added bounded query limits after profiling the cost of sending 150 handles to a mod that needed only 16.

Expanded security coverage to host globals, static/dynamic import, function constructors, loops, recursion, memory, prototype mutation, invalid/oversized state, register mutations, async jobs, CPU accumulation and suppressed quota exceptions. Pure declarations and frozen runtime entry points prevent hidden initialization. Callback budgets now use Node 24 thread CPU time with a secondary wall deadline: OS descheduling had caused false failures with wall-only accounting. Perf assertions still use actual elapsed wall time, without filtering outliers or relaxing the local gates.

Overlay: prioritized collision-free labels (reserving damage-number space), name-hashed palettes/hats, larger sprites, meteor core/trail/embers/impact/crater, keep torch glow and ambient embers/vignette. Captured full and meteor screenshots in `docs/media/` using installed Chrome, with no browser download. First FPS attempt exposed rollback during a 300-join event burst; removed Aurora's unnecessary join callback and made the dev population fixture durable so the measurement cannot silently drop below 300 entities.

Validation evidence on Windows / Node 24.14.0 / pnpm 10.18.2:

| Measurement                             |   Result |     Gate |
| --------------------------------------- | -------: | -------: |
| Simulation avg                          | 0.357 ms |    ≤3 ms |
| Simulation p95                          | 0.591 ms | reported |
| Simulation p99                          | 1.678 ms |   ≤10 ms |
| Simulation max                          | 3.096 ms |   ≤25 ms |
| Overlay average FPS                     |    96.77 |      ≥58 |
| Overlay p5 FPS                          |    71.43 |      ≥50 |
| Minimum entities during 10 s FPS sample |      304 |     ≥300 |

Simulation suite: 900 measured ticks, 120 warm-up ticks, three active mods with sub/raid events and periodic checkpoints. Slow-tick diagnostics also report thread CPU time to distinguish OS scheduling pauses. Earlier runs failed during profiling; the latest isolated run passed all unchanged gates. Installed Chrome's rAF cadence on this machine can exceed 60 Hz; these are measured rates, not a frame cap. Unit/security suites are sequential to reduce timing contention. CI runs unit/security, isolated perf (×3 thresholds) and builds on Windows and Ubuntu. Final CI run link is recorded in the task report.

Codex Builder remains `@openai/codex-sdk` 0.164.0 + ChatGPT login + explicit `gpt-6.1-sol`; prior successful smoke thread `01a17c46-b6c6-7be3-aa76-4cc47ba72978`, output `FORGE_OK`. No new paid AI call was needed for this QC pass. M1 is complete; M2 Twitch/Crowd Sim is next and has not started.

Final local checks: frozen install, typecheck, lint, 74 unit/security tests, isolated performance test, build and installed-Chrome FPS gate passed. Both development servers were stopped after browser verification. No model/API key or global Codex setting was changed.

CI for implementation commit 5c294a8 passed on both OSes: [run 40475056652](https://github.com/vansyson1308/chatforge/actions/runs/40475056652). CI performance (avg / p95 / p99 / max): Ubuntu 0.282 / 0.512 / 0.955 / 4.140 ms; Windows 0.166 / 0.343 / 0.933 / 2.313 ms. Generated dist folders and Vite caches were removed; no listeners remained on ports 3000/5173. Chrome profiles from this task were removed automatically on browser close.
