# ChatForge — Devpost draft

## Inspiration

A livestream is usually a finished game with a chat beside it. We wanted a small community to change the game together while everyone watches the result appear.

## What it does

Viewers pitch features with `!idea` and vote on three Producer cards. The winning idea becomes a real mod written by the Codex SDK. A deterministic Gatekeeper checks it before it can join the live Forge Keep game. The overlay credits contributors, shows the build and showcases the result. The keep and patch history persist between streams.

## How we built it

Codex built the project from an empty folder in one main thread, guided by the lead prompts preserved in `brief/prompts/`. Inside the product, a separate Codex SDK Builder writes each single-file mod in a restricted workspace. A Node server receives Twitch EventSub events, runs the round state machine and owns SQLite persistence. A worker runs the deterministic game and QuickJS mods; a Canvas overlay renders snapshots and a React dashboard controls the stream.

## Challenges we ran into

We had to keep untrusted chat and generated code away from host execution, preserve world state across rollback, and make a 45–60 second build visually interesting. Ideas on the broadcast now pass local rules and OpenAI moderation, generated code passes static and simulation checks, and the HUD shows a sanitized code tail and sprite preview. A real showcase revealed that a mod could consume its own cooldown on deploy; the contract now reserves the main introduction for the host showcase.

## Accomplishments we're proud of

A 45-minute SIM-only soak shipped 21 of 21 real builds. A separate Twitch plus SIM run shipped three of three on their first attempt, with a 40.3-second median build time, and confirmed the outbound announcements. A later Twitch recording captured real chat and two more showcases. The latest local suite passed 190 tests. These are measured runs, not claims that every generated mod will pass.

## What we learned

The on-stream moment matters as much as the compiler result. We also learned to label simulated contributors, fail closed when moderation is unavailable, and report real test limitations instead of presenting a staged result as live.

## What's next for ChatForge

Broaden accessibility and mod authoring tools, and continue improving admission checks and observability based on real streams.

## Built with

Codex and the Codex SDK, OpenAI Responses and moderation APIs, Twitch EventSub and Helix, TypeScript, Node.js, pnpm, SQLite, QuickJS, Vite, React, Canvas and Vitest.
