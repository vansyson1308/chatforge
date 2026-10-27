# ChatForge

ChatForge turns Twitch chat into a live game studio: viewers pitch and vote on ideas, then a Codex-powered Builder creates sandboxed game mods that can appear on stream, credited to their creators.

**Status: under construction — M0 harness.** No product features are implemented yet.

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

`pnpm dev` runs the package placeholders; it does not launch an application yet. Configure `.env` locally for future integrations. Run `pnpm smoke:codex` and `pnpm smoke:openai` to check the AI prerequisites. `pnpm test:e2e` intentionally reports unavailable until M5. See [the brief](brief/CHATFORGE_BRIEF.md) and [architecture](docs/ARCHITECTURE.md).
