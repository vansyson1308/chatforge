# ChatForge — demo narration and recording guide

The edit is under 2:55; speed-up is visibly labelled. Public Twitch chat is read-only. Viewer text is shown as recorded, and SIM viewers are explicitly identified.

| Approximate time | Picture                                                                | Narration / proof                                                                                    |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0:00–0:12        | Full-screen showcase                                                   | What if Twitch chat could ship the game while you stream? Meet ChatForge.                            |
| 0:12–0:24        | Ideas + public chat, x4                                                | Viewers pitch ideas in chat. Rules and moderation keep unapproved ideas off the broadcast feed.      |
| 0:24–0:34        | Vote + public chat, x4                                                 | The Producer turns community ideas into cards. Chat votes on what happens next.                      |
| 0:34–0:42        | Reviewed chat moderation moment, if annotated                          | The unsafe request was rejected at the next curation; it never entered the broadcast idea feed.      |
| 0:42–0:58        | Code and sprite, x4; push toward the Builder panel                     | Codex writes a real mod in a restricted workspace.                                                   |
| 0:58–1:06        | Gatekeeper checks                                                      | Gatekeeper validates and simulates before deployment.                                                |
| 1:06–1:20        | Full-screen SHIPPED and SHOWCASE                                       | The winning idea ships into the running game with credits and a showcase.                            |
| 1:20–1:34        | Trust boundaries                                                       | The server owns the game. Mods run in QuickJS; the overlay receives snapshots.                       |
| 1:34–2:02        | Public GitHub history, prompts, journey, measured stats and SDK thread | Codex built ChatForge from an empty folder in one main thread; the SDK also powers the live Builder. |
| 2:02–2:14        | Full-screen keep and repo URL                                          | Every round leaves a mark. Chat ships the game.                                                      |

Run `pnpm demo:take` for Twitch plus SIM, or `pnpm demo:take --sim --minutes 6` for a labelled dry run. Stop any running server first; the take creates a fresh season and preserves Twitch tokens. `pnpm demo:edit <take>` uses that take's timeline, actual video and public GitHub pages. An optional `highlights.json` is a reviewed, take-specific moderation annotation; without one the edit omits the moderation close-up rather than inventing timestamps. Check the real chat and final edit before publishing. The recorded malicious Twitch request in the reviewed take was rejected in the following curation; the earlier bot refusal came from SIM input. The viewer's first vote appeared after the winner announcement.

For take 3, submit the dragon idea during COLLECTING, wait for the addressed acceptance/card replies, and cast the vote while VOTING is open. A late real idea arriving while the Producer is working triggers a refreshed selection before cards publish. Under continuous real input, curation allows at most two refreshes within the existing 90-second deadline; exhaustion fails visibly instead of silently publishing a SIM-only selection. Real authors retain priority and credits; the lead still verifies the real winning build and showcase in the new footage.

Reuse the reviewed moderation close-up from take 1 without changing the editor:

```powershell
pnpm demo:edit runtime/recordings/TAKE_3 --moderation-from runtime/recordings/2026-10-28T01-47-43-629Z
```

The source take's `highlights.json` supplies `moderationAtSeconds`, `maliciousRowY`, `refusalRowY`, `chatCropWidth` and `chatCropHeight`. Row coordinates mark text centers in the source capture. The editor uses that take's chat video/duration and labels it as an earlier real Twitch take; every other shot comes from the new take. Invalid timestamps fail explicitly. Hook/outro titles sit on their own band at y=785–875, above the caption bar and below the HUD. No new recording was made for this fix; existing take frames were decoded to verify placement and cross-take source selection.
