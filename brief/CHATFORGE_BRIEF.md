# ChatForge — Product & Technical Brief (source of truth)

> "Twitch chat doesn't just play the game. Chat ships the game — live."

Hackathon: **Codex x TwitchCon Hackathon** (Devpost). Deadline **Nov 2, 2026 2:00 PM PT** (hard). Goal: **1st place**.
Judging (equal weight): Innovation/Idea · Potential Impact for streamers & communities · Technological implementation (incl. how well Codex is used) · Design (ease of use, fun to watch).
Judges may NOT run the project: the 3-minute YouTube demo + README + Devpost text must carry everything.
Hard rules: built during the submission period, built with Codex (submit the main Codex Session ID), must connect to Twitch (chat / EventSub / API / overlay). Do NOT build a Twitch Extension (review takes 5–14 days). No API keys in git.

---

## 1. The product in one paragraph

ChatForge turns a Twitch stream into a live, collaborative game studio. A small "seed" game runs as an OBS browser-source overlay. Viewers pitch features in chat (`!idea ...`). Every round, an AI **Producer** moderates and clusters the pitches into 3 feature cards; chat votes (`!vote 1|2|3`). The winning card goes to the **Builder** — the **Codex SDK running server-side** — which writes a sandboxed game _mod_ against a constrained Mod API. A **Gatekeeper** statically checks and headlessly simulates the mod; if it passes, the mod is **hot-loaded into the running game on stream**, credited to the viewers who pitched it. If it fails, the Builder gets the failure report and retries; if it still fails, the overlay shows a dramatic "BUILD FAILED" moment and the game stays on the last good version (automatic rollback). The build itself is content: the overlay shows each stage (Spec → Coding → Testing → Deploy) with live stats streamed from Codex. Twitch events (sub, cheer, raid, follow) trigger the features the community built. At the end of the stream ChatForge publishes **Patch Notes** crediting every contributor, and the game persists so the next stream continues the same "season".

Why it matters (pitch): viewers go from spectators to co-developers; any streamer — even with 5 viewers — gets a show where chat's ideas visibly change the world; and it showcases Codex not just as the tool that built ChatForge, but as a live engine inside it.

## 2. Users & surfaces

1. **Viewer** (Twitch chat only, no install): `!idea <text>`, `!vote <n>`, `!join` (spawns their hero), `!help`. Sees their name on screen and in patch notes.
2. **Streamer** (dashboard, localhost web app): connect Twitch, start/stop rounds, set round timings, approve/veto a card before build, veto/rollback a live mod, kill-switch ("safe mode" = disable all mods), see logs & costs.
3. **OBS overlay** (browser source, 1920x1080, transparent background): the game + Forge HUD.

## 3. Architecture (decided — do not change without reason)

TypeScript everywhere, Node 24, **pnpm workspaces monorepo**, ESM, `strict` TS.

```
apps/
  server/      Node service: Twitch auth + EventSub WebSocket, chat send, round state machine,
               Producer, Builder (Codex SDK), Gatekeeper, persistence, WebSocket hub, serves overlay & dashboard builds
  overlay/     Vite + TS + Canvas2D (no heavy framework): pure snapshot renderer + Forge HUD; OBS browser source
  dashboard/   Vite + React: streamer control panel
packages/
  engine/      Deterministic game runtime (fixed tick, seeded RNG, ECS-lite), runs in a Node worker or headless tests
  sandbox/     Mod execution in QuickJS (quickjs-emscripten) in Node; memory + time limits;
               interrupt handler stops infinite loops; zero host access
  mod-api/     The ONLY surface mods can touch: typed API + markdown docs written for the AI Builder + examples
  shared/      Protocol types + zod schemas for every WS message and persisted record
runtime/       (gitignored) forge workspace for the Builder, sqlite db, logs
docs/          ARCHITECTURE.md, MOD_API.md, SECURITY.md, CODEX_JOURNEY.md, DEMO_SCRIPT.md
```

The simulation is server-authoritative: `apps/server` owns a Node `worker_thread` running the engine and all mods, isolated from server I/O. The overlay only renders WebSocket snapshots at approximately 20–30 Hz and interpolates at 60 fps. The headless engine used by tests and the Gatekeeper is the same engine without the worker. This makes the server the single source of truth for persistence and rollback; QuickJS is required only in Node.

### 3.1 Seed game: "Forge Keep"

Pixel-art side/top view: a small keep at the center; each viewer who types `!join` (or chats) gets a tiny named hero who auto-wanders and auto-fights. Waves of simple enemies approach the keep. Minimal but juicy (screen shake, particles, damage numbers). It must be _obviously moddable_: enemies, heroes, weapons, weather, events, rules, visual effects. Built-in sprite atlas (procedurally generated pixel sprites or a small CC0 set — record license in README). Must look good at 1080p and leave the HUD readable.

### 3.2 Mod model

- A mod = one ES2020 JS source file exporting `register(api)`. Plain JS (the Builder may author TS that we transpile, but what runs is JS).
- Mods run inside QuickJS, never in the page/Node realm. The host exposes only the Mod API via explicit bindings.
- Mod API capabilities (initial set, extend carefully): define entity kinds (sprite, stats, behavior hooks), spawn/despawn, query entities, timers, game events (`tick`, `wave_start`, `hero_join`, `enemy_killed`, `twitch:sub`, `twitch:cheer`, `twitch:raid`, `twitch:follow`, `chat_command` for mod-registered commands), tweak rules (wave size, speed, gravity, etc. within bounds), visual FX (particles, shake, tint, weather layers, text banners), sound cue ids (optional).
- Budgets: per-tick CPU time, max entities per mod, max timers, max banner text length; exceeding → mod is disabled + auto-rollback + HUD message.
- Every viewer-originated string shown on screen is drawn with canvas `fillText` / DOM `textContent` only. **Never innerHTML.** (Reference: Sept 2026 research — "How One Twitch Chat Message Became Code Execution on a Streamer's PC" — an XSS in a vibecoded OBS chat overlay led to native code execution. ChatForge's security story answers this directly.)
- Mods are versioned; the game state can roll back to the previous mod set instantly.

### 3.2.1 M1 lead QC refinements (approved)

Mod callbacks append validated commands to per-call buffers; only successful callbacks commit their world writes and RNG changes. Full snapshots happen before mod deployments and every 300 ticks, never per callback. The engine uses an ID map and uniform spatial grid, plus hero separation steering. Overlay snapshots are compact render-only arrays at 20 Hz.

`register(api)` is declaration-only (`define*`, `on`, `every`, `registerCommand`, `onSchedule`). Closures are ephemeral. Replace `after(ticks, fn)` with `onSchedule(name, handler)` plus runtime `schedule(name, delayTicks, jsonPayload)`. Full snapshots include mod-set version/sources, declaration tick, JSON states, repeating timer phases, named schedule queues and command cooldowns. Rollback restores the complete checkpoint and re-registers that exact set. See the lead decisions in `brief/prompts/P1B_ENGINE_HARDENING.md` and executable API contract in `docs/MOD_API.md`.

M1 performance gates: isolated 300 entities + three mods + 900 ticks, avg ≤3 ms, p99 ≤10 ms, max ≤25 ms locally; CI thresholds ×3. Installed-Chrome 10-second overlay gate with ≥300 entities: avg ≥58 FPS, p5 ≥50 FPS.

### 3.3 Round state machine (server)

`IDLE → COLLECTING (ideas, e.g. 90s) → CURATING (Producer) → VOTING (e.g. 45s) → [STREAMER_APPROVAL optional] → BUILDING → TESTING → DEPLOYING → LIVE → IDLE`, plus `FAILED` and `ROLLED_BACK`. All timings configurable. One build at a time; next round can collect ideas while a build runs.

### 3.4 AI roles

- **Producer** (OpenAI Responses API, structured outputs): input = moderated ideas with authors; output = exactly 3 feature cards `{title ≤40 chars, pitch ≤120 chars, acceptance criteria[], credited authors[], risk}`. Rejects unsafe/hateful/sexual/off-topic ideas. Uses the OpenAI moderation endpoint first. Model configurable via env.
- **Builder** = **Codex SDK** (`@openai/codex-sdk`), one thread per stream session, working directory `runtime/forge-workspace/` that contains MOD_API.md, type defs, current mods, and a test command. Sandbox: workspace-write only. The Builder's job: write `mods/<id>.js` satisfying the card's acceptance criteria and run the local mod test. Stream Codex events (start, file changes, command runs, done) to the HUD. Must have a time limit and cancellation. **Fallback builder** (env `BUILDER=responses`): direct Responses API generation with the same contract, for when the Codex SDK is unavailable.
- **Gatekeeper** (deterministic code, no AI): AST static checks (acorn) for forbidden constructs, compile in QuickJS, headless simulation of N ticks with scripted events (join, wave, sub, raid, chat command), invariant checks (no throws, budgets respected, entities bounded, determinism), produce a pass/fail report. Fail → report back to Builder (max 2 retries).

### 3.5 Twitch integration

- OAuth Authorization Code flow on localhost (`http://localhost:3000/auth/twitch/callback`); tokens stored locally (runtime/, gitignored), auto-refresh.
- Chat in: **EventSub WebSocket** `channel.chat.message`. Chat out: Helix **Send Chat Message**. Use the streamer's own account as the bot (scopes: `user:read:chat`, `user:write:chat`, `user:bot`, plus those needed for sub/cheer/raid/follow events: `channel:read:subscriptions`, `bits:read`, `moderator:read:followers`).
- Events: `channel.subscribe`, `channel.subscription.gift`, `channel.cheer`, `channel.raid`, `channel.follow` (v2).
- The channel is NOT an Affiliate → no native Polls/Predictions; voting is via chat commands.
- **Chat source abstraction**: `twitch` | `simulator`. The Simulator ("Crowd Sim") generates realistic chat (ideas, votes, joins, fake sub/raid events) so everything can be developed and tested offline. Twitch CLI mock EventSub may be used for event testing.
- Rate limits: per-user idea cooldown, max idea length, dedupe; respect Twitch chat send limits.

### 3.6 Persistence

SQLite via Node 24's built-in `node:sqlite` (avoid native addons on Windows). Store seasons, rounds, ideas, cards, votes, builds (with Codex thread id), mods (source + version), contributors. Export `PATCH_NOTES.md` per stream and a public read-only "Forge Log" page.

### 3.7 Overlay HUD (design matters — "fun to watch")

- Corner HUD, never covering the game center. States: idea feed (sanitized, scrolling), 3 vote cards with live bars + countdown, build panel (stage stepper, Codex activity ticker: "editing mods/meteor-rain.js", "running tests 12/12 ✓"), deploy celebration (banner + confetti + credits), failure moment, rollback animation, patch-notes ticker.
- Distinct visual identity (not generic): forge/anvil theme, molten orange + deep slate, chunky pixel font for titles, clean sans for body. 60 fps target.

## 4. Non-functional requirements

- Runs on **Windows 11** (the streamer's machine) — scripts must work in PowerShell; no bash-only scripts.
- One command to start everything in dev (`pnpm dev`) and in "stream" mode (`pnpm start`).
- Secrets only in `.env` (gitignored); provide `.env.example`.
- Tests: vitest unit tests for engine, sandbox, gatekeeper, state machine, protocol; an end-to-end "simulated stream" test (Crowd Sim → full round → mod live) that runs headless in CI.
- GitHub Actions CI on every push (typecheck, lint, test, build).
- Clean up after yourself: stop dev servers/background processes you start, delete temp files. The machine's disk is filling up.

## 5. Codex usage story (this is scored)

- The project is built from an empty folder by Codex. Keep ONE main Codex thread for the build where possible.
- Maintain `docs/CODEX_JOURNEY.md`: per milestone — what was asked, what Codex built, notable decisions, problems fixed. This feeds the Devpost write-up and video.
- In the product, Codex SDK is the live Builder → "Codex built ChatForge, and Codex is the engine inside it."

## 6. Milestones (each ends with green CI + a commit + journey entry)

- **M0 Harness**: repo, monorepo skeleton, tooling, CI, AGENTS.md, docs skeleton, GitHub private repo `vansyson1308/chatforge`, verify toolchain & model availability.
- **M1 Engine + Sandbox + Seed game + Mod API**, headless sim, 3 hand-written example mods proving the API.
- **M2 Twitch**: OAuth, EventSub chat & events, send chat, Crowd Sim source.
- **M3 Forge loop**: state machine, Producer, voting, Builder (Codex SDK + fallback), Gatekeeper, hot-reload, rollback, persistence.
- **M4 Overlay HUD + Dashboard + game juice** (visual polish pass).
- **M5 Hardening**: security review, budgets, failure drills, patch notes & Forge Log, e2e simulated stream in CI, performance.
- **M6 Demo kit**: README (judges-first), architecture diagram, DEMO_SCRIPT.md, Devpost copy draft, screenshots.

## 7. Definition of done for the hackathon

A real Twitch stream where: viewers pitch → vote → Codex builds a mod live → it appears in the game within a few minutes, credited → a Twitch event triggers it → a failed build rolls back gracefully → patch notes are generated. Recorded into a ≤3-minute public YouTube video. Repo public (or shared), README excellent, Codex session ID captured.
