# Codex journey

## M0 — Harness (2026-10-27)

Requested: establish the seven-package workspace, repeatable Windows/Linux checks, documentation, private GitHub repository and feasibility probes before product work. Built: strict TypeScript/ESM placeholders, lint and test tooling, CI and documented security boundaries. Decisions: pin pnpm 10 via Corepack; leave model IDs unset until verified; make the future end-to-end command explicitly fail until M5 rather than report a false success. Smoke and CI outcomes are reported in the M0 handoff.

Feasibility: Node 24 SQLite and QuickJS evaluated 1 + 1 successfully. The available OpenAI model list included `gpt-5.4-mini` and `gpt-5.3-codex` as candidates, not selected defaults. The Codex SDK reached the existing ChatGPT login but the configured `gpt-6.1-terra` was rejected as unsupported for that account; select an account-supported Codex model before retrying. Model-list presence alone does not prove suitability or access through Codex login.
