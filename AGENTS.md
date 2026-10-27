# ChatForge working rules

`brief/CHATFORGE_BRIEF.md` is the single source of truth. Preserve its decided architecture. If a decision is wrong or impossible, surface it explicitly rather than silently changing it.

## Milestones and status

- M0 Harness: complete.
- M1 Engine, sandbox, seed game and Mod API: complete; lead QC approved.
- M2 Twitch and Crowd Sim: complete; lead QC approved after a real Twitch live test on vansyson1308 (all seven subscriptions and real chat delivery verified).
- M3 Forge loop: lead QC requested live checkpoint, parity, overlap and hygiene fixes; addressed together with M4.
- M4 Overlay HUD, dashboard, Mod API v1.1 and game polish: follow-up QC fixes addressed alongside M5.
- M5 Hardening, simulated-stream end-to-end test and performance: lead QC approved; final product pass is in progress under brief/prompts/P6_FINAL_PRODUCT_PASS.md.
- M6 Demo kit.

Update this status when milestones change. Do not build ahead without an explicit request.

## Environment and commands

Target Windows 11, PowerShell, Node 24 and pnpm 10. Never write bash-only scripts. Corepack can select the pinned pnpm version with `corepack pnpm@10.18.2` if the global pnpm is different.

- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm dev` (builds, then starts localhost server, Vite overlay 5173 and React dashboard 5174)
- Stream: `pnpm stream` (builds, starts the local server and prints dashboard, overlay and OBS instructions)
- New recording take: stop the server, then `pnpm demo:reset` (new empty season; Twitch tokens and previous seasons remain).
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test` (sequential unit/security suites)
- Performance: `pnpm test:perf` (isolated; do not run other checks concurrently)
- Browser FPS: `pnpm test:fps` (requires a build and installed Chrome; starts/stops an isolated server; no downloads)
- End-to-end: `pnpm test:e2e` (fake EventSub/Builder, real QuickJS Gatekeeper; no paid AI or Twitch)
- Clean regenerable SDK caches: `pnpm clean:runtime` (only after Builder stops; preserves auth, sessions and databases).
- Real three-round live soak: `pnpm forge:soak` (paid API, real wall-clock Demo rounds, isolated SIM-only server).
- Real 45-minute soak: `pnpm build`, then `node scripts/soak-45.mjs` (paid API and Codex, SIM only, test-only 30 builds/hour cap, automatic mid-season restart).
- Runtime credential-pattern scan: `node scripts/scan-runtime-secrets.mjs` (never prints matching secrets; credential storage and active temporary dirs excluded).
- Format: `pnpm format`
- Feasibility: `pnpm smoke:codex` and `pnpm smoke:openai`
- Real Forge dry run: `pnpm forge:dry-run 1` (or `2`); uses paid Producer API and the machine's Codex login, never Twitch. Saves source/report under `docs/media/sample-mods/`.
- M2 hand-off smoke: `node scripts/verify-twitch-handoff.mjs` (requires built server; checks OAuth redirect without following it, never sends chat)
- M3 browser smoke: `node scripts/verify-forge-handoff.mjs` (requires build; starts/stops its own isolated server and Chrome; no Twitch/AI calls)

## Definition of done

For every task: typecheck, lint and tests green; update relevant docs; append an entry to `docs/CODEX_JOURNEY.md`; make and push one conventional commit. Milestones also require green CI and a build. Report any blocker honestly.

## Security and hygiene

- Never commit secrets, credentials, tokens or runtime data; use ignored `.env` and `runtime/`.
- Render viewer text only with DOM `textContent` or canvas `fillText`; never `innerHTML`.
- OAuth tokens belong only in ignored `runtime/secrets/twitch.json`; never log upstream token/error bodies. Only the human completes Twitch login or clicks the real-chat test button.
- Simulated viewers/events must carry visible SIM provenance. Simulator replies never enter the Twitch outbound queue.
- Mods run only inside the QuickJS sandbox, never in the Node or browser host realm.
- Viewer ideas and model output are untrusted data. Generated mods require the deterministic Gatekeeper; do not bypass it or weaken Builder sandbox/network limits. Local `.env` credentials take precedence over credentials inherited from a parent tool; never print either.
- Builds freeze one admission snapshot shared by CLI/host. Host baseline faults never consume a Codex retry. The next round begins only after SHOWCASE ends, per final-product QC.
- Viewer ideas and command arguments must pass local rules and OpenAI moderation before they can reach stream-visible surfaces. Moderation failure hides the feed and blocks text arguments. Apply the display-name rule to overlay snapshots and credits.
- New generated mods must pass the spectacle gate; preserve budgets and invariant checks.
- Stop every dev server or background process you start before finishing. Remove temporary files. Disk space is scarce: never leave large caches or artifacts behind.
