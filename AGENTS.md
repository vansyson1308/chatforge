# ChatForge working rules

`brief/CHATFORGE_BRIEF.md` is the single source of truth. Preserve its decided architecture. If a decision is wrong or impossible, surface it explicitly rather than silently changing it.

## Milestones and status

- M0 Harness: complete.
- M1 Engine, sandbox, seed game and Mod API: current milestone.
- M2 Twitch and Crowd Sim.
- M3 Forge loop, AI, Gatekeeper and persistence.
- M4 Overlay HUD, dashboard and game polish.
- M5 Hardening, simulated-stream end-to-end test and performance.
- M6 Demo kit.

Update this status when milestones change. Do not build ahead without an explicit request.

## Environment and commands

Target Windows 11, PowerShell, Node 24 and pnpm 10. Never write bash-only scripts. Corepack can select the pinned pnpm version with `corepack pnpm@10.18.2` if the global pnpm is different.

- Install: `pnpm install --frozen-lockfile`
- Dev: `pnpm dev` (M0 placeholders only; no product server yet)
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`
- End-to-end: `pnpm test:e2e` (explicitly unavailable until M5)
- Format: `pnpm format`
- Feasibility: `pnpm smoke:codex` and `pnpm smoke:openai`

## Definition of done

For every task: typecheck, lint and tests green; update relevant docs; append an entry to `docs/CODEX_JOURNEY.md`; make and push one conventional commit. Milestones also require green CI and a build. Report any blocker honestly.

## Security and hygiene

- Never commit secrets, credentials, tokens or runtime data; use ignored `.env` and `runtime/`.
- Render viewer text only with DOM `textContent` or canvas `fillText`; never `innerHTML`.
- Mods run only inside the QuickJS sandbox, never in the Node or browser host realm.
- Stop every dev server or background process you start before finishing. Remove temporary files. Disk space is scarce: never leave large caches or artifacts behind.
