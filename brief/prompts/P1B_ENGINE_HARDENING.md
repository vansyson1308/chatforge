Lead QC of M1 prototype (commits b752175, 13414a4). Good progress and the Codex SDK path is proven (gpt-6.1-sol + ChatGPT login — keep it as the default Builder). Below are my review findings and DECISIONS. Implement all of them to finish M1. Also commit `brief/prompts/*` (lead prompts are part of the Codex journey story).

## 1. Root cause of the perf problem (from code review)
- `mod-host.ts` takes a full `world.snapshot()` (JSON deep copy of the entire world) around EVERY dispatch, every tick, per mod, so it can roll back on error. That is O(world) per mod per tick and is the main cost + GC spike source.
- `world.ts` combat/AI uses `entities.find` / `entities.filter` inside the per-entity loop (owner lookup, target search, opponents) → O(n²).
- `copy = JSON.parse(JSON.stringify())` used on hot paths; state hash stringifies the whole world.

### Decision A — Command buffer instead of per-tick snapshots
Mod handlers never mutate the world directly. Every mutating API call (spawn, damage, heal, setSpeed, rules.set, fx.*, schedule…) appends a validated command to a per-call buffer. When the handler returns successfully within budget, the host applies the buffer atomically; if it throws or exceeds budget, the buffer is discarded (nothing to roll back). Reads (`query`, `rules.get`, entity getters) read the live world through cheap, read-only views. Full snapshots happen ONLY at checkpoints: before deploying/replacing a mod, and a periodic checkpoint (e.g. every 10 s) used for persistence and "rollback to last good".

### Decision B — Engine data structures
- `Map<id, entity>` index; uniform-grid spatial hash rebuilt (or incrementally updated) per tick for nearest/radius queries; no `find/filter` inside per-entity loops.
- Hero separation steering (simple boids separation) so heroes don't stack into one blob.
- Hash/snapshot helpers stay out of the tick path (tests and checkpoints only).
- Snapshot to overlay: send only render fields, 20 Hz, compact arrays (not the whole state object).

### Decision C — Performance gates (make them real)
Create a dedicated perf suite run in isolation (`pnpm test:perf`, sequential, not in parallel with other tests). On this machine, 300 entities + 3 example mods for 900 ticks must hit: avg ≤ 3 ms, p99 ≤ 10 ms, max ≤ 25 ms. On CI, run the same suite with thresholds ×3 (shared runners are noisy) — still fail on regression. Report avg/p95/p99/max.

## 2. Timer/closure persistence — DECISION
Closures are ephemeral; only JSON survives. Contract changes (update mod-api types, MOD_API.md, examples, tests):
- `register(api)` is a pure **declaration phase**: only `define*`, `on`, `every`, `registerCommand`, `onSchedule` are allowed there. Calling `spawn`/`fx`/mutations during register throws a clear error.
- `every(ticks, fn)` may only be declared in register; on restore the mod is re-registered and the repeating timers are re-created with the same phase (store the declaration tick in the snapshot).
- Replace closure-based `after(ticks, fn)` with **named schedules**: `api.onSchedule('name', (payload) => {...})` declared in register, and `api.schedule('name', delayTicks, payload)` at runtime. The pending schedule queue (name, dueTick, JSON payload) is part of the world snapshot.
- Any data a mod needs after restart/rollback must live in `api.state` (JSON, size-capped). Document this rule loudly for the LLM author.
- Rollback = restore world snapshot (entities, rules, schedule queues, mod states, mod-set version) + re-register that exact mod set. Add a test proving full-world rollback after a bad mod deploy (state hash equals pre-deploy checkpoint + deterministic continuation).

## 3. Finish the M1 scope that is still missing
- `defineHeroWeapon`, `defineProjectile` (with tests and one example usage — upgrade `aurora-blessing` or add a 4th example mod `chain-lightning` hero weapon).
- The full sandbox security suite from P1 (process/require/import()/fetch/host globals, infinite loop, recursion bomb, huge allocation, prototype pollution, Function/eval abuse, Date/Math.random determinism) + new: mutation during register, oversized `api.state`, command-buffer flooding (cap commands per call).
- Overlay 60 fps proof: a script using `playwright-core` + installed Chrome (`channel: 'chrome'`, no browser downloads) that loads `?mode=full` with 300 entities spawned via the dev endpoint, measures rAF frame times for 10 s, and prints avg fps + 5th-percentile fps. Target: avg ≥ 58, p5 ≥ 50. Report numbers.

## 4. Visual QC of docs/media/forge-keep-meteor.png (fix the fundamentals now; full polish is M4)
- Name labels overlap into unreadable piles → label de-clutter: hide/fade labels that collide (priority: newest joiners, top levels, the hero being credited), small dark outline/plate for contrast, never draw labels over damage numbers.
- Heroes look identical → deterministic per-viewer appearance from a hash of the name (palette + hat/hair/class variants) so viewers can find themselves.
- Sprites read too small at 1080p → raise the base pixel scale; keep crisp nearest-neighbor.
- Meteor is a flat brown disc → glowing core + trail + ember particles + impact flash/crater decal; telegraph circle pulses and fills as impact approaches.
- Scene feels empty/flat → ambient embers, torch glow on the keep, subtle vignette.
Re-capture both screenshots after the fixes.

## Done = all tests (incl. security + perf + full rollback) green, CI green on both OSes, docs + journey updated, commits pushed, processes stopped. Report: perf table, fps numbers, screenshot paths, contract changes summary, anything blocked.
