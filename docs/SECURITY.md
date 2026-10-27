# Security

## Threat model

Twitch viewers control chat text, names and events; AI-generated mod source is untrusted. A malicious mod may try to escape its sandbox, exhaust memory or CPU, mutate host objects, or attack the overlay. The local developer endpoints can change the simulation and must not be exposed to the public network.

The [September 2026 SCRT research](https://blog.scrt.ch/2026/09/22/how-one-twitch-chat-message-became-code-execution-on-a-streamers-pc/) demonstrated an XSS in an OBS chat overlay chained with a Chromium vulnerability. Viewer-originated strings in ChatForge must be rendered with canvas `fillText` or DOM `textContent`, never `innerHTML`.

## Current boundaries

- The development server binds `127.0.0.1`; mutation endpoints require a local dev origin and JSON and are disabled when `NODE_ENV=production`.
- Simulation and mods run in a Node worker. Mods execute in separate QuickJS runtimes, not in the Node or browser realm. Host operations use bounded JSON messages and are validated and clamped on receipt.
- Each QuickJS runtime has a memory cap, stack cap and interrupt deadline. `Date`, `Math.random`, `eval` and dynamic function constructors are disabled. The host restricts mod, entity, command, timer and per-callback operation counts.
- Secrets are stored in ignored `.env` and runtime data in ignored `runtime/`; neither belongs in git.

## Validation status and limitations

M1 is in progress. Current tests cover isolated host globals, infinite loops, recursion, allocations, host prototype separation, example mods and a hot-reload rollback case. They do not prove that all sandbox escapes are impossible. Full import and constructor abuse coverage, repeated-failure handling, serializable mod timers/state, whole-set rollback, comprehensive quotas and adversarial review remain outstanding. Do not use this development harness with untrusted production mods until those checks are complete.
