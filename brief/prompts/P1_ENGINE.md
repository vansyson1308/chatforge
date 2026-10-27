Great M0 work. Lead QC result: harness is solid. Two facts changed since your report:
- The repo is now **PUBLIC** and CI run 40466127604 is **green on windows-latest and ubuntu-latest** (the billing block only affected private repos).
- I verified the OpenAI API key's model list: available ids include `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `omni-moderation-latest`, `gpt-image-2`. (`gpt-5.4-mini` / `gpt-5.3-codex` are outdated guesses — drop them.)

## Part A — close out M0 (small, do first, one commit)
1. **Codex SDK smoke must pass.** `~/.codex/config.toml` sets `model = "gpt-6.1-terra"`, which the ChatGPT-account login rejects. Do NOT edit the user's global config. Instead make the Builder/smoke pass the model explicitly (env `CODEX_MODEL`, default `gpt-6.1-sol`) via the SDK's per-thread/config options. Retry in this order until one works: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol` with the ChatGPT login; if all fail, try the SDK's API-key auth path using `OPENAI_API_KEY` from `.env` (read the installed SDK's README/types in node_modules to find the correct option — don't guess). Record the working combination (auth mode + model + thread id + output `FORGE_OK`) in `docs/CODEX_JOURNEY.md`. This de-risks the core of the product, so be thorough.
2. `.env.example`: set defaults `PRODUCER_MODEL=gpt-6.1-terra`, `BUILDER_MODEL=gpt-6.1-sol`, `CODEX_MODEL=gpt-6.1-sol`, add `MODERATION_MODEL=omni-moderation-latest`. Update `smoke:openai` candidates to the verified ids above. (The real `.env` already exists with keys — never print or commit it.)
3. Add an MIT `LICENSE`, a CI badge in README, and bump GitHub Actions to majors that run natively on Node 24 (verify current majors; remove the Node 20 deprecation warnings).
4. Mark M0 complete in AGENTS.md, set current milestone to M1, journey entry, commit, push, confirm CI green.

## Part B — Milestone M1: Engine + Sandbox + Seed game "Forge Keep" + Mod API

### Architecture refinement (approved by lead — update brief §3 and ARCHITECTURE.md accordingly)
The simulation is **server-authoritative**: the engine + all mods run in a Node `worker_thread` owned by `apps/server` (isolated from server I/O). The overlay is a pure renderer that receives snapshots over WebSocket (~20–30 Hz) and interpolates to 60 fps. Consequences: QuickJS only needs to run in Node; one source of truth for persistence/rollback; multiple overlays/dashboards stay consistent. The headless simulation used by tests and (later) the Gatekeeper is the same engine without the worker.

### packages/engine
- Fixed tick (30 Hz), seeded RNG (no `Math.random`, no wall-clock in sim), ECS-lite world; full world state JSON-serializable → snapshot/restore (needed for rollback + persistence); stable snapshot hash for determinism tests.
- Systems: movement, AI behaviors (wander, chase nearest target, orbit, ranged/kite, guard keep), combat (melee + projectiles), waves (scaling), hero progression (levels on kills), death/loot, keep HP + "keep falls → new wave cycle" (never a hard game over on stream).
- Render-agnostic FX event queue (shake, particles, banner, tint, weather, floating damage numbers) consumed by the overlay.
- `rules` object with explicit min/max bounds for every tunable (wave size, enemy speed multiplier, spawn rate, gravity-like knobs, hero damage multiplier…).
- Heroes: one per viewer (`joinViewer(name)`), name label, auto behavior, idle despawn after N minutes, max hero count with graceful queueing.

### packages/mod-api (the contract the AI Builder will write against — make it excellent)
- Typed API + `docs/MOD_API.md` written *for an LLM author*: concise, complete, with 6+ copy-pasteable examples and an explicit list of limits.
- Capabilities v1: `defineEnemy`, `defineHeroWeapon`, `defineProjectile`, `spawn`, `query`, entity handles (damage/heal/setSpeed/tag), `on(event)` for `tick | wave_start | wave_end | hero_join | enemy_killed | keep_damaged | twitch:sub | twitch:cheer | twitch:raid | twitch:follow`, `registerCommand('!name', handler(viewer, args), {cooldownSec})`, `every(ticks)`, `after(ticks)`, `rules.set(key, value)` (clamped), `fx.*` (shake, particles, banner, tint, weather: rain|snow|ash|meteor|aurora), `random()` (seeded), mod-private persistent `state`, `log`.
- **Custom pixel sprites**: mods can declare sprites as small char-grid strings + palette (max 24x24, max 8 colors) — this lets the Builder *draw* new creatures. Validate strictly.
- Mods are plain JS exporting `register(api)`.

### packages/sandbox
- quickjs-emscripten: one isolated context per mod, memory limit, per-call CPU deadline via interrupt handler (budget per tick per mod), max entities/timers/commands per mod, only JSON-safe values cross the boundary via explicit bindings. Errors captured with mod id + message + stack.
- Budget violation or repeated errors → mod auto-disabled and an FX/HUD event emitted; world rolls back to the last good mod set.
- Load/unload/replace a mod at runtime (hot reload) with rollback to previous version.
- Security tests (must exist and pass): attempts to reach `process`, `require`, `import()`, `fetch`, `globalThis` host objects, infinite loops, recursion bombs, huge allocations, prototype pollution of host objects, `Function`/`eval` abuse, Date/Math.random non-determinism → all blocked or neutralized.

### apps/server (M1 scope only)
- Sim worker + WebSocket hub broadcasting snapshots + FX events; HTTP endpoints for dev controls (join viewer, fire fake twitch events, load/unload mod) — dev-only, localhost-only.
- Loads mods from `runtime/mods/` + bundled example mods.

### apps/overlay
- Canvas2D renderer: crisp pixel-art scaling, procedurally generated sprite atlas (code-drawn pixel sprites; no external assets needed), forge palette (molten orange / ember / deep slate), parallax background, readable name labels, damage numbers, particles, screen shake, weather layers.
- Two modes: `?mode=full` (opaque 1920x1080 scene — the game *is* the stream; default) and `?mode=overlay` (transparent background, game in a bottom band).
- Interpolates server snapshots; holds 60 fps with 300 entities.
- A temporary dev keyboard panel (J = join random viewer, S = fake sub, R = fake raid, M = toggle example mod) until Crowd Sim arrives in M2. Viewer names rendered via `fillText` only.

### Three example mods (authored as if by the Builder; each with tests)
1. `meteor-shower`: `!meteor` command (cooldown) + auto-trigger on `twitch:sub`; meteors with telegraph circles, impact particles, shake.
2. `slime-king`: boss enemy with a custom pixel sprite, splits into slimes on death; spawns every 3rd wave.
3. `aurora-blessing`: on `twitch:raid`, aurora weather + all heroes buffed for 20s with a banner crediting the raider.

### Quality gates for M1
- Determinism test (same seed + inputs → same hash), snapshot round-trip, rollback test, hot-reload test, the security test suite, a perf test (300 entities + 3 mods for 30 simulated seconds under budget).
- Capture 2 screenshots of the running overlay (full mode, mid-wave with meteor shower active) into `docs/media/` using `playwright-core` with the **installed Chrome** (`channel: 'chrome'`). Do NOT download Playwright browsers (disk is nearly full).
- Update ARCHITECTURE.md (with the refinement), MOD_API.md, SECURITY.md (threat model + sandbox guarantees, cite the Sept 2026 OBS overlay XSS research), journey entry. Commit in logical steps, push, CI green.
- Stop all servers/processes you start; delete temp files.

FINAL REPORT (same structure as M0) plus: the working Codex SDK combination, screenshot paths, perf numbers (avg/max tick ms), and any API design decisions the Builder should know about.
