Lead QC of M2: APPROVED after a REAL live test on Twitch (account vansyson1308). Results: OAuth OK, token healthy, EventSub connected, all 7 subscription types accepted (enabled). Real chat: `!join` → real hero without SIM tag ✓, `!idea …` queued ✓, link idea rejected ✓, `!vote 2` recorded ✓, `!help` real bot reply ✓, `!meteor` routed to the mod (impact ring seen) ✓, normal chat ✓, dashboard "Send test chat message" delivered to real chat ✓. Sim stopped when switched to Twitch only ✓.

Mark M2 complete and start **Milestone M3 — the Forge loop** (the heart of the product). First fix the live-test bugs.

## Part A — live-test bugs (fix first, with regression tests)
1. **"Local access only" on legitimate navigations.** After Twitch authorizes, the redirect chain (auth.twitch.tv → /auth/twitch/callback → /dashboard/) arrives with `Sec-Fetch-Site: cross-site` and the dashboard document is refused; the same happens when a URL is opened from another site/tab. Keep the Host/remote-address checks (DNS-rebinding protection) and keep APIs, WebSocket upgrades and mutations strict, but allow top-level **GET document navigations** (`Sec-Fetch-Mode: navigate` + `Sec-Fetch-Dest: document`) to the static dashboard/overlay pages and OAuth routes regardless of `Sec-Fetch-Site`. They are side-effect free.
2. **Bot prefix arrives as `?` in real Twitch chat** ("? ChatForge: !join …", "? ChatForge connection test — the forge is ready!"). The em dash survives, so the `⚒` (U+2692) is being lost in our source/build, not by Twitch. Fix it at the root (file encoding / literal), and add a test asserting the outbound payload contains U+2692 as UTF-8.
3. **Idea Inbox duplicates:** after toggling sources the Crowd Sim replays its seeded sequence from the start and the same (author, text) pairs are queued again (57 entries, each idea ~3×). Persist/continue the sim RNG across toggles, and dedupe normalized (author, text) against pending inbox rows in SQLite (not just in memory).
4. Note for M4 (do not fix now): at wave 12 the keep was still 100% and enemies idle on the hills — no tension. Pacing will be reworked in M4.

## Part B — M3 Forge loop (brief §3.3–3.6)

### Round state machine (server)
`IDLE → COLLECTING → CURATING → VOTING → [STREAMER_APPROVAL] → BUILDING → TESTING → DEPLOYING → LIVE → IDLE` (+ `FAILED`, `ROLLED_BACK`). Presets: **Demo** (collect 45 s, vote 30 s, auto-approve 10 s) and **Normal** (90 s / 45 s / manual approve). Next round may COLLECT while a build runs; only one build at a time. Every transition persisted and broadcast.

### Producer (OpenAI Responses API, `PRODUCER_MODEL`, structured outputs from zod schemas)
- Stage 1 moderation: `omni-moderation-latest` + a rule layer that rejects ideas targeting the host machine or real world ("delete files", "steal", "dox", ads/spam) with a playful public reason ("the forge only shapes the game world").
- Stage 2 curation: cluster near-duplicates, merge credits, and produce exactly 3 cards: `{title ≤40, pitch ≤120, visualHook (what viewers will SEE), acceptance[] (observable in simulation), commands[] (new chat commands, if any), credits[] (viewer ids/names), feasibility (fits Mod API?), risk}`. Give the Producer a compact summary of MOD_API capabilities and the currently live mods so it proposes things the Builder can actually ship and avoids repeats.
- If fewer than 3 viable ideas, fill with clearly labelled "Forge suggestion" cards (never attributed to a viewer).

### Voting
`!vote 1|2|3`, one vote per viewer (last vote wins), live tallies broadcast, tie → earliest card. Bot announces round open (cards, 1 line each), voting open, winner — concise and rate-limited.

### Builder = Codex SDK (default) — the star of the show
- Per build, prepare `runtime/forge-workspace/`: a builder `AGENTS.md` (strict rules: write exactly one file `mods/<modId>.js`, obey MOD_API.md, no other files, run the local test until green), `MOD_API.md`, type definitions, example mods, the currently live mods (read-only reference), `card.json`, and a local CLI `node forge-test.mjs mods/<modId>.js` that runs the Gatekeeper simulation so Codex can iterate on its own.
- SDK settings: model `CODEX_MODEL` (gpt-6.1-sol), modest reasoning effort for speed (make it configurable), sandbox workspace-write limited to the forge workspace, no network, non-interactive approvals. Reuse one Codex thread per stream session so it accumulates context about the game and previous mods (faster later builds); persist the thread id.
- Stream SDK events to the HUD as short sanitized activity lines ("reading MOD_API.md", "editing mods/rubber-ducks.js", "running forge-test 9/9 ✓"). Track build duration and attempts.
- **Testable acceptance:** the mod must also export `forgeTest = { commands?, events?, expect: { spawnKinds?, fx?, rules?, minEffects? } }`; the Gatekeeper drives those commands/events in simulation and verifies the expected observable effects actually happened. A mod that "does nothing" fails.
- Hard timeout (configurable, default 4 min) + cancel. On Gatekeeper failure, send the report back as a follow-up turn in the same thread (max 2 retries). Fallback builder `BUILDER=responses` honors the identical contract.

### Gatekeeper (deterministic, no AI)
acorn static checks (no import/require/eval/Function/with/async/Promise/WebAssembly/global tricks; source ≤ 24 KB; exports `register` + `forgeTest`), QuickJS compile, headless sim of the **current live checkpoint + current mod set + candidate** for 900 ticks with scripted joins/waves/sub/cheer/raid/follow + the card's commands, invariants (no errors, budgets, bounded entities, determinism: run twice → same hash), `forgeTest.expect` verification. Produces a structured report (also shown compactly on the HUD).

### Deploy, live, rollback, safe mode
Checkpoint → hot-load → celebration FX + banner crediting the viewers → bot announcement ("⚒ Shipped: Rubber Duck Rain — thanks @a @b! Try !ducks"). Live failure → automatic rollback + HUD "ROLLED BACK". Dashboard: approve/veto card, cancel build, rollback last mod, Safe Mode (disable all generated mods instantly).

### Persistence + Patch Notes
SQLite: seasons, rounds, ideas, cards, votes, builds (thread id, attempts, durations, status, report), mod versions (source), contributors. On restart, resume the season (mod set + latest checkpoint). Patch Notes generator (markdown) per session crediting contributors; dashboard button + `GET /forge/patch-notes`.

### HUD protocol + basic HUD
WS messages for round state, idea count, cards, tallies, countdowns, build stages, Codex activity ticker, deploy/fail/rollback events, patch-note ticker. Overlay renders a basic but clean HUD now (corner panels, never over the keep). Full visual polish is M4.

### Dashboard (functional)
Start/stop Forge, preset selector, current round panel, approve/veto, build log (Codex activity + Gatekeeper report), mod list with rollback, Safe Mode, patch notes, usage counters (builds/hour cap, Responses tokens).

### Tests
State machine with fake timers; Producer with mocked OpenAI (schema, moderation, filling); Builder via an adapter interface with a fake Codex implementation; Gatekeeper corpus of ≥15 malicious/broken/"does nothing" mods; full simulated round end-to-end (Crowd Sim + fake builder returning a known-good mod) reaching LIVE; failure path (fail → retry → fail → stays on last good, HUD event); restart/resume.

### REAL end-to-end dry run (required — this proves the product)
Add `pnpm forge:dry-run`: headless, Crowd Sim ideas, REAL Producer + REAL Codex Builder + Gatekeeper, one complete round. Print a timeline (curate s, build s, attempts, gatekeeper results) and save the generated mod + report into `docs/media/sample-mods/`. Run it at least 2 times with different winning cards. Target: build+test < 3 minutes. If slower, tune (reasoning effort, workspace size, prompt, thread reuse) and report what you changed.

Done = Part A fixed, all tests + CI green, dry runs succeeded with numbers, docs (ARCHITECTURE, SECURITY: AI/LLM threat model incl. prompt injection via viewer ideas, MOD_API) + journey updated, commits pushed, processes stopped. Report in the usual structure plus the dry-run timelines and the two generated mods' names.
