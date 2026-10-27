# ChatForge

[![CI](https://github.com/vansyson1308/chatforge/actions/workflows/ci.yml/badge.svg)](https://github.com/vansyson1308/chatforge/actions/workflows/ci.yml)

ChatForge turns Twitch chat into a live game studio: viewers pitch and vote on ideas, then a Codex-powered Builder creates sandboxed game mods that can appear on stream, credited to their creators.

**Status: under construction — M1 in progress.** The development simulation and overlay are experimental; sandbox and rollback hardening are incomplete.

## Quick start

Requires Node 24 and pnpm 10. In PowerShell:

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm dev` builds the workspace and starts the localhost simulation and overlay at `http://127.0.0.1:5173/`. Press J to join a viewer, S for a fake sub, R for a fake raid, and M to toggle the meteor example. `?mode=overlay` selects the transparent bottom-band view. The development endpoints are localhost-only and are not intended for production. Configure `.env` locally for future integrations. Run `pnpm smoke:codex` and `pnpm smoke:openai` to check the AI prerequisites. `pnpm test:e2e` intentionally reports unavailable until M5. See [the brief](brief/CHATFORGE_BRIEF.md) and [architecture](docs/ARCHITECTURE.md).
