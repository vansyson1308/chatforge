# Real M4 live soak

Three consecutive real Demo rounds reached LIVE on 2026-10-27, using hype Crowd Sim, real Responses Producer and real Codex SDK. No collection/vote time acceleration and no Twitch connection. Shared thread: `01a17d28-dc88-7ed0-a8f8-3bd12a9a5245`. Producer `gpt-6.1-terra`; Builder `gpt-6.1-sol`, low reasoning.

| Round / winning card          | Credits (all SIM)                  | Build through LIVE | Attempts | Score | Hash twice | Visible moment                                                                                   |
| ----------------------------- | ---------------------------------- | -----------------: | -------: | ----: | ---------- | ------------------------------------------------------------------------------------------------ |
| 1. Thunder Lizard Armory      | TinyTroll, MưaNhỏ                  |           52.648 s |        1 | 10/10 | `773b1b8e` | Pixel dragon forge, lightning/rings, two heroes receive lightning gear (!dragon).                |
| 2. Marshmallow Mayhem         | QuietQuokka, 星の鍛冶屋, SparkSage |           50.856 s |        1 | 10/10 | `64a4d573` | Three custom marshmallows, magic warning/impact, one hero receives fluffy projectiles (!mallow). |
| 3. The Fast and the Flourious | CloudCrafter, SparkSage, GearGnome |           41.954 s |        1 | 10/10 | `c54c872c` | Pizza portal/prop, custom slice projectiles and an equipped hero, ring aftermath (!pizza).       |

Exact unedited generated sources: [round 1](m4-soak-1.js), [round 2](m4-soak-2.js), [round 3](m4-soak-3.js). Reports: [1](m4-soak-1.json), [2](m4-soak-2.json), [3](m4-soak-3.json). Each contains canonical credits, full card, timeline, shared thread ID and independent 900-tick deterministic runs. Build time includes baseline, SDK and host gate. A local SDK turn can repair internally; “1 attempt” means one host Builder invocation, not a claim that Codex wrote perfect code in one edit.

Gate durationSeconds is the observed activity span over the 30-second harness (including repeated commands and persistent entities), not a measured duration of one cinematic. The final unit suite revalidates all three sources together with 40 heroes under the current harness. Saved hashes describe the actual admission snapshots at the time, not a fresh unrelated world.

All three current sources are original Builder output. Later HUD layout/performance refinements are illustrated by explicitly labelled replays in [HUD evidence](../hud/README.md); actual soak screenshots remain separate. No repair happened in this successful three-round sequence.

---

# Real M3 dry runs

Both rounds used the real OpenAI Responses Producer, real Codex SDK Builder with ChatGPT login, and deterministic QuickJS Gatekeeper. These are generated artifacts, not hand-authored fixtures. The second run restored the first run's live checkpoint and reused the same thread: `01a17ccb-ee60-7711-9210-545ce1ebd805`.

| Winning card                      | Curation | Builder | Gate to deploy | Build + test + deploy | Attempts | Hash (both runs) |
| --------------------------------- | -------: | ------: | -------------: | --------------------: | -------: | ---------------- |
| [Cheer Sparks](forge-1-6.js)      |  15.20 s | 56.58 s |         1.55 s |               58.13 s |        1 | `6a9108b8`       |
| [Wave-End Breather](forge-1-8.js) |  10.35 s | 48.90 s |         1.42 s |               50.32 s |        1 | `45f893e6`       |

Reports: [Cheer Sparks](forge-1-6.json), [Wave-End Breather](forge-1-8.json). Each report records 900 ticks twice, all checks, viewer credits and a wall-clock timeline. Collection/voting clocks are accelerated by the dry-run command. The first timeline also contains an older failed round and an overlapping next collection/curation; the command now runs one round at a time to avoid unnecessary API usage. No timing or result was rewritten after generation.

Producer: `gpt-6.1-terra`; Builder: `gpt-6.1-sol`, low reasoning. Both met the under-three-minute target without lowering validation budgets. Initial diagnostics caught a parent-process API key overriding the local key, a missing explicit Windows sandbox selection, and ambiguous credit attribution when one viewer submitted multiple ideas. Fixes: explicit local credential precedence, isolated Codex configuration with Windows sandbox enabled, and Producer group IDs resolved to authoritative viewer credits.

The emitted `forgeTest` checks observable FX/spawns/rules, not the semantic truth of arbitrary English acceptance prose. For example, the healing mod's generated test asserts its banner/particles; its healing implementation is additionally covered by the sample acceptance test against injured heroes. M5 owns broader adversarial and long-stream testing.
