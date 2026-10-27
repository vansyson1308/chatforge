# M5 real-system soak

The [report](report.json) records a 45.001-minute run on Windows, with a real Producer and Codex, Demo timing, normal Crowd Sim, an isolated SIM-only database, and a test-only cap of 30 builds/hour. No Twitch account or real chat was used. The fixed seed and saved sources do not make the AI output deterministic; the Gatekeeper ran each candidate simulation twice and checked matching hashes.

| Measure                  | Result                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed builds         | 21/21 LIVE (100%); all passed on attempt 1                                                                                                           |
| Build time, through LIVE | p50 52.016 s; p95 65.044 s (nearest rank)                                                                                                            |
| Active generated mods    | 21 maximum                                                                                                                                           |
| Rollbacks                | 0                                                                                                                                                    |
| Restart                  | All 12 mod IDs retained; tick 33098 before, 33003 after, a 95-tick checkpoint rewind                                                                 |
| Tick p99                 | ≤3.1 ms over the entire run, in 0.1 ms histogram bins                                                                                                |
| Real 15–16 mod window    | ≤3.6 ms p99 across 2,700 recorded ticks in 122.1 s ([measurement](live-15-plus.json))                                                                |
| Server RSS               | 102.1 MiB at the first sample, 300.7 MiB at the last/maximum sample; includes the simulation worker but excludes separate Chrome and Codex processes |
| Browser rAF              | Of 44 full 600-frame samples, sample averages ranged 127.1–144.0 FPS; the lowest sample p5 was 72.5 FPS                                              |

Tick timing measures `host.tick` and excludes separately scheduled checkpoint serialization and message handling. The first FPS sample had only 85 frames and is excluded from the range. These measurements describe this machine and load, not a guarantee for every stream.

The first diagnostic run stopped after 17 minutes because a separate read-only evidence exporter hit a SQLite lock; [interrupted-diagnostic.json](interrupted-diagnostic.json) is retained as a diagnostic and is excluded from the table. On the final run the automatic restart window was too brief, so the operator stopped the voting round 13 and started collection to create a safe window without interrupting a build. The script's `Curation failed; restart requested` entry refers to that deliberately stopped round, which had zero build attempts; it does not demonstrate a Producer failure. The simultaneous manual start encountered a connection refusal while the script restarted the server, which then restored the checkpoint and started Forge. Round 23 was still building when the 45-minute test ended and is not included in the completed-build denominator.

The run used the compiled build from before the final HUD text-fit/duplicate-headline fixes and before the stricter repeated-SIM-mention Gatekeeper check. Those later changes have separate targeted verification and are not represented as tested throughout the entire soak. Actual per-round mod sources are `round-*.js`; phase screenshots and a real ten-patch frame are in [HUD evidence](../hud/README.md).

The [real abuse drill](real-abuse-drill.json) filtered three hostile ideas locally before the real Producer/moderation request and processed one safe idea. It does not claim the attack strings reached the model or prove security against arbitrary prompt injection.

The [real Codex interruption drill](codex-kill-drill.json) used a separate SIM-only server after the soak and terminated the verified Codex child process during a build. The round entered FAILED with `Build failed` and no generated mod was deployed. The first drill attempt did not establish that result because Windows `taskkill` returned exit 128; its owned server and temporary data were cleaned up. A second attempt succeeded. Mocked tests also cover Producer 500/timeout, while EventSub and overlay reconnection and runtime-mod rollback are exercised by the E2E/browser checks.
