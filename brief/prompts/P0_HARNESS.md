You are the lead engineer building **ChatForge** from an empty folder for the Codex x TwitchCon Hackathon. We are aiming for 1st place, so quality, clarity and polish matter as much as speed.

FIRST, read `brief/CHATFORGE_BRIEF.md` completely. It is the single source of truth (product, architecture, milestones, constraints). Do not redesign the architecture; if you believe something in it is wrong or impossible, say so explicitly in your final report instead of silently deviating.

This task is **Milestone M0 — Harness**. Do not build product features yet. Deliver:

1. **AGENTS.md** at the repo root — the permanent working rules for every future Codex turn on this repo:
   - brief/CHATFORGE_BRIEF.md is the source of truth; milestones M0–M6; current milestone tracking.
   - Environment: Windows 11, PowerShell, Node 24, pnpm 10. Never write bash-only scripts.
   - Exact commands: install, dev, build, typecheck, lint, test, e2e.
   - Definition of done for any task: typecheck + lint + tests green, docs updated, `docs/CODEX_JOURNEY.md` entry appended, one conventional commit pushed.
   - Security rules: no secrets in git; viewer text rendered only via textContent/fillText, never innerHTML; mods only run inside the QuickJS sandbox.
   - Hygiene: stop any dev server/background process you start before finishing; delete temp files; the disk is nearly full — never leave large caches or artifacts behind.
2. **pnpm workspace monorepo** exactly as in brief §3: `apps/server`, `apps/overlay`, `apps/dashboard`, `packages/engine`, `packages/sandbox`, `packages/mod-api`, `packages/shared`. Each with package.json, strict tsconfig (shared base config), a minimal compiling placeholder `src/index.ts`, and one trivial vitest test so the pipeline is real. ESM throughout.
3. **Tooling**: TypeScript strict, ESLint (flat config) + Prettier, Vitest, root scripts (`dev`, `build`, `typecheck`, `lint`, `test`, `format`). Keep the toolchain lean (no turborepo unless clearly needed).
4. **Config & secrets**: `.gitignore` (node_modules, dist, runtime/, .env, logs, coverage), `.env.example` with documented keys: `OPENAI_API_KEY`, `PRODUCER_MODEL`, `BUILDER` (codex|responses), `BUILDER_MODEL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback`, `PORT=3000`, `CHAT_SOURCE` (twitch|simulator).
5. **CI**: GitHub Actions workflow on push/PR running install → typecheck → lint → test → build on `windows-latest` (our target OS) and `ubuntu-latest`. Use pnpm caching.
6. **Docs skeleton**: `README.md` (one-paragraph pitch + "status: under construction" + quick start), `docs/ARCHITECTURE.md` (copy the decided architecture from the brief, with a mermaid diagram), `docs/MOD_API.md`, `docs/SECURITY.md`, `docs/DEMO_SCRIPT.md` (placeholders with headings), and `docs/CODEX_JOURNEY.md` with the M0 entry.
7. **Feasibility smoke checks** (this is important — report results precisely):
   a. Install `@openai/codex-sdk` in `apps/server` and add `pnpm smoke:codex`: a tiny script that starts a Codex thread in a temporary read-only workspace, asks it to reply with exactly `FORGE_OK`, prints the result and the thread id, then cleans up the temp dir. Run it once. It should use the machine's existing Codex login; if it needs an API key or fails on Windows, capture the exact error and propose the fix.
   b. Add `pnpm smoke:openai`: if `OPENAI_API_KEY` is set (via `.env`, loaded with dotenv), list available models and print which of the candidate model ids for the Producer/Builder exist; if the key is not set, print a clear message and exit 0. Do not hardcode a model we have not verified.
   c. Confirm `node:sqlite` works on this Node version and that `quickjs-emscripten` installs and can evaluate `1+1` in both Node (test) — add these as tiny tests in `packages/sandbox` / `apps/server`.
8. **Git & GitHub**: `git init` on branch `main`, commit everything (including `brief/`), then create the **private** repo `vansyson1308/chatforge` with `gh repo create vansyson1308/chatforge --private --source . --push`. Confirm CI starts; if CI fails, fix it until green on both OSes.

Constraints: keep dependencies minimal and mainstream; pin versions via lockfile; no placeholder "TODO" code that pretends to work.

FINAL REPORT (in this exact structure):

- What you built (tree of the repo, 2 levels deep)
- Commands you ran and their outcomes (install / typecheck / lint / test / build)
- Smoke results: codex (thread id + output or exact error), openai (models found or "no key"), sqlite, quickjs
- CI status with the run URL
- Deviations from the brief (if any) and why
- Anything that needs the human (keys, logins, approvals)
- Confirmation that no background processes are left running and temp files are removed
