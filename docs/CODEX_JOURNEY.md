# Codex journey

## M0 — Harness (2026-10-27)

Requested: establish the seven-package workspace, repeatable Windows/Linux checks, documentation, private GitHub repository and feasibility probes before product work. Built: strict TypeScript/ESM placeholders, lint and test tooling, CI and documented security boundaries. Decisions: pin pnpm 10 via Corepack; leave model IDs unset until verified; make the future end-to-end command explicitly fail until M5 rather than report a false success. Smoke and CI outcomes are reported in the M0 handoff.

Feasibility: Node 24 SQLite and QuickJS evaluated 1 + 1 successfully. The available OpenAI model list includes the current configured candidates. The original SDK reached the existing ChatGPT login but its configured `gpt-6.1-terra` was rejected for that account. Model-list presence alone does not prove suitability or access through Codex login.

M0 closeout: GitHub Actions run 40466127604 passed on Windows and Ubuntu after the repository became public. The original SDK 0.87.0 rejected the requested ChatGPT models; the API-key fallback reported no credits. Upgrading the SDK to 0.164.0 allowed ChatGPT authentication with `gpt-6.1-sol`: thread `01a17c46-b6c6-7be3-aa76-4cc47ba72978` returned `FORGE_OK`. Model availability and auth remain account-dependent. The project now passes the model explicitly without changing global Codex configuration.

## M1 — foundation in progress (2026-10-27)

The lead approved server-authoritative simulation in a Node worker and a snapshot-only overlay; the brief and architecture record that refinement. Initial work adds a seeded, tick-driven world with JSON snapshots and replay tests, a draft typed mod contract and sprite validator, and a QuickJS isolation primitive with bounded JSON host calls and preliminary adversarial tests. This foundation is not yet the M1 product: the worker, validated host bindings, rollback, examples, overlay and full security and performance gates remain to be implemented and verified.
