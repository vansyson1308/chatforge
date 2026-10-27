# Real M3 dry runs

Both rounds used the real OpenAI Responses Producer, real Codex SDK Builder with ChatGPT login, and deterministic QuickJS Gatekeeper. These are generated artifacts, not hand-authored fixtures. The second run restored the first run's live checkpoint and reused the same thread: `01a17ccb-ee60-7711-9210-545ce1ebd805`.

| Winning card                      | Curation | Builder | Gate to deploy | Build + test + deploy | Attempts | Hash (both runs) |
| --------------------------------- | -------: | ------: | -------------: | --------------------: | -------: | ---------------- |
| [Cheer Sparks](forge-1-6.js)      |  15.20 s | 56.58 s |         1.55 s |               58.13 s |        1 | `6a9108b8`       |
| [Wave-End Breather](forge-1-8.js) |  10.35 s | 48.90 s |         1.42 s |               50.32 s |        1 | `45f893e6`       |

Reports: [Cheer Sparks](forge-1-6.json), [Wave-End Breather](forge-1-8.json). Each report records 900 ticks twice, all checks, viewer credits and a wall-clock timeline. Collection/voting clocks are accelerated by the dry-run command. The first timeline also contains an older failed round and an overlapping next collection/curation; the command now runs one round at a time to avoid unnecessary API usage. No timing or result was rewritten after generation.

Producer: `gpt-6.1-terra`; Builder: `gpt-6.1-sol`, low reasoning. Both met the under-three-minute target without lowering validation budgets. Initial diagnostics caught a parent-process API key overriding the local key, a missing explicit Windows sandbox selection, and ambiguous credit attribution when one viewer submitted multiple ideas. Fixes: explicit local credential precedence, isolated Codex configuration with Windows sandbox enabled, and Producer group IDs resolved to authoritative viewer credits.

The emitted `forgeTest` checks observable FX/spawns/rules, not the semantic truth of arbitrary English acceptance prose. For example, the healing mod's generated test asserts its banner/particles; its healing implementation is additionally covered by the sample acceptance test against injured heroes. M5 owns broader adversarial and long-stream testing.
