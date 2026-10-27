Lead QC of M3. The dry runs were impressive (50–58 s builds, deterministic hashes) and Part A fixes are confirmed (dashboard opens normally now). But I ran the REAL product in Demo preset with Crowd Sim (hype) + real Producer + real Codex for ~6 minutes, watching overlay and dashboard. It is NOT shippable yet. Findings below, in priority order. This milestone = **M3 fixes + M4 (spectacle, HUD, game feel)**. We are going for 1st place: judges mostly see a 3-minute video, so what happens on screen is everything.

# P0 — live builds always fail (fix first, add regression tests)
1. Round 1 "Penguin March": 3/3 attempts FAILED, round 2 "Waddling Penguin" failing the same way. Persisted report: `simulation 1: "Entity invariant failed"`, `ticks: 0`, `effects: 0`. Codex's local `forge-test` passed at least once ("Running local Gatekeeper (exit 0)") while the host Gatekeeper failed at tick 0. Diagnosis: the host runs the candidate on the **real live checkpoint** (≈30 heroes incl. some standing on the keep roof, many enemies, several live mods, wave 6–8); that baseline itself trips an entity invariant before the candidate does anything. The dry runs passed only because their world was small.
   - Run the **baseline** (live checkpoint + current mod set, no candidate) through the exact same invariants first. If the baseline fails, that is a host bug: log it loudly, auto-heal/clamp the world, and never charge it to Codex or burn a retry.
   - Fix the offending invariant/world state (find which one; likely entity count, bounds/positions, or a stale reference).
   - Invariant failures must be **specific** (which invariant, entity id/kind/field/value, tick) so Codex can repair.
   - **Parity:** `forge-test.mjs` in the workspace must use the same harness, the same live checkpoint snapshot and the same mod set as the host Gatekeeper; add a parity test so "local pass / host fail" is impossible.
   - Regression fixture: a "busy live world" checkpoint (hype Crowd Sim ~5 min, 40 heroes, wave 8, ≥3 live mods). Candidate builds must pass against it.
2. **Rounds overlap:** round 2 was VOTING while round 1 was still building/failing, so viewers voted on "Waddling Penguin" while "Penguin March" was being forged. Rule: while a build is active, the next round may only COLLECT ideas; CURATING/VOTING wait until the build resolves (LIVE or FAILED). The Producer must exclude ideas that duplicate the active build or any live mod.
3. **Workspace hygiene:** `runtime/forge-workspace/mods/` still contains stale dry-run mods (forge-1-1, forge-1-6, forge-1-8). Reset `mods/` per build; live mods belong only in the read-only `live/` reference folder.
4. **Disk:** the isolated Codex home `runtime/secrets/forge-codex` grew ~403 MB (`.sandbox-bin`, `plugins/cache`). Disable plugins/skills/MCP/apps in the builder's Codex config so no plugin cache is created; keep only what the SDK truly needs. Add `pnpm clean:runtime` that safely removes regenerable caches (never login/sessions/db).
5. Idea statuses: the dashboard shows dozens of good ideas as "rejected" (e.g. "Every raid summons a dragon hero weapon"). Distinguish `merged` / `used` / `not chosen` / `rejected (moderation, with reason)`. Not-chosen ideas return to the pool for the next round.

# P1 — SPECTACLE (the biggest gap for 1st place)
What shipped so far is technically correct but invisible on stream: `Cheer Sparks` is 461 bytes of particles+shake; `Wave-End Breather` heals 5 HP. Voting cards were "Smiling Cloud", "Penguin March", "Confetti Button" — bland. Every shipped mod must be a moment viewers clip.
6. **Producer rubric** (put it in the system prompt and the schema): score and prefer ideas that (a) are visible within 10 s of deploy, (b) involve chat (a new `!command`) or Twitch events, (c) add a new creature / hero gear / boss with a custom pixel sprite, (d) create a timed world event with telegraph → climax → aftermath. Reject trivial cards (only particles/banner, tiny stat tweaks). Titles punchy and funny; `visualHook` vivid. Always show credited viewer names on cards. Rewrite a weak viewer idea into its most spectacular feasible version (keep the credit).
7. **Builder quality bar** (builder AGENTS.md): each mod must include at least 2 of: a new custom pixel sprite (≥12×12, ≥4 colors, recognisable), a new chat command, a new enemy/projectile/weapon/boss, a timed world event; layered FX; a credit banner naming contributors; fair balance (fun, not game-breaking). Target 60–200 lines of clean code. Show Codex 2 excellent reference mods (write them yourself as gold standards, e.g. "Rubber Duck Armageddon" and "Dragon Raid Ally").
8. **Gatekeeper spectacle score:** count distinct visible effect types, new sprites drawn, entities spawned, commands registered, world-event duration. Below threshold → fail with actionable feedback ("too subtle: add a sprite or a command…") so Codex upgrades it.
9. **Mod API v1.1 visual vocabulary** (update types, MOD_API.md, examples, sandbox bindings, overlay renderer): `fx.text(x,y,str)` floating text, `fx.ring`, `fx.beam/lightning(x1,y1,x2,y2)`, `fx.flash`, `fx.trail(entityId)`, `fx.sky(theme, seconds)` (blood moon, sunset, aurora, storm…), entity `scale` for big bosses, **cosmetics** (`defineHat(sprite)`, `equipHat(heroId)` — viewers love seeing their hero wear the community's creation), **props** (decor entities without AI), `sfx(cueId)` played by a small WebAudio synth in the overlay (mutable).
10. **The keep evolves:** every shipped mod permanently adds a visible piece to the keep (banner with the mod's icon, a stone, a tower lantern…). After an hour of streaming, the keep itself is the community's patch history.

# P2 — HUD redesign for a real stream (current HUD is unreadable)
Current panels use tiny low-contrast text in the corners, cover the moon, and the dev hint "J JOIN · S SUB…" shows on stream. Redesign for 1080p + Twitch compression + mobile viewers: body ≥ 28 px, titles ≥ 44 px, strong contrast, the forge identity (molten orange / ember / slate, chunky pixel display font + clean sans). Never cover the keep; respect safe areas; also lay out correctly in `?mode=overlay`. Dev hints only with `?dev=1`.
11. Phase banner top-center with a big countdown ring; phase-specific call-to-action ("TYPE !idea …", "VOTE !1 !2 !3").
12. Idea feed: newest 4 ideas slide in with author.
13. Vote cards: 3 large cards with "!vote N" badge, title, visualHook, contributor names, animated tally bars + %.
14. Winner reveal: the winning card slams onto an anvil center-stage → "CODEX IS FORGING…".
15. Build theatre: stage stepper Spec → Code → Test → Deploy, live Codex activity ticker (monospace, typed effect, sanitized), elapsed timer, attempt counter, Gatekeeper checks ticking ✓ one by one.
16. Failure drama: red flash "GATEKEEPER CAUGHT A BUG: <specific, short>" → "Codex is repairing (attempt 2/3)". Final failure: "BUILD REJECTED — the game stays safe" + rollback animation. Failures are content, not silence.
17. Ship moment: anvil strike, sparks, big "SHIPPED!" with title + credits + "try !command" call-to-action, then the feature visibly happens.
18. Bottom ticker of patch notes + a "Hall of Patches" panel (shipped mods + credits) that can be toggled.
Also make the **bot chat announcements** match these moments (round open, vote open, winner, shipped, failed) — concise, rate-limited, ⚒ prefix.

# P3 — Game feel & pacing
19. Enemies must march on the keep in readable waves from the sides along the ground band (no slimes floating in the sky); the keep takes damage; boss every 5th wave; "THE KEEP HAS FALLEN" moment → rebuild (never game over). Waves scale with hero count so 3 heroes and 40 heroes are both tense.
20. Heroes: never stand on the keep roof; defend in a loose formation around the keep; spread out (no clumps); level-up flash.
21. World: foreground detail, parallax layers, slow day/night cycle, ambient life. Keep 60 fps with 300 entities (re-run `test:fps`).

# Verification (required)
- All unit/security/perf tests + CI green; new tests for P0 1–5, spectacle score, overlap rule, parity.
- **Live soak:** run the real system (Crowd Sim hype + real Producer + real Codex) in Demo preset for **3 consecutive rounds**. At least 3/3 should reach LIVE now that the P0 is fixed; report each round: winning card, credits, build time, attempts, spectacle score, and what visibly happened.
- Capture overlay screenshots for each phase (collecting, voting, winner reveal, building, gatekeeper repair if it happens, shipped, the mod in action, hall of patches) into `docs/media/hud/` with playwright-core + installed Chrome. Save the 3 generated mods + reports to `docs/media/sample-mods/`.
- Update docs (MOD_API v1.1, FORGE_LOOP, ARCHITECTURE, DEMO_SCRIPT draft) + journey. Commit in logical steps, push, stop every process you start, run `pnpm clean:runtime` at the end.

Report in the usual structure + the soak table + screenshot paths.
