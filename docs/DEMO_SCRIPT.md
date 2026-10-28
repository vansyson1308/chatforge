# ChatForge — demo narration and recording guide

Final edit: under 2:55. The final YouTube video must use a real Twitch take; a SIM-only draft is labelled and cannot establish Twitch operation. All time compression is labelled `x4`. Public chat is read-only; no browser login is required.

| Time      | Picture                            | Narration                                                                                                            |
| --------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:12 | Real showcase; title               | What if Twitch chat could ship the game while you stream? Meet ChatForge.                                            |
| 0:12–0:24 | Ideas and moderated feed           | Viewers pitch ideas in chat. Local rules and moderation keep unapproved ideas off the broadcast.                     |
| 0:24–0:34 | Vote cards and chat                | The Producer turns community ideas into cards. Chat votes on what happens next.                                      |
| 0:34–0:50 | Codex code and sprite, labelled x4 | Codex writes a real game mod in a restricted workspace. The stream sees the code and sprite come together.           |
| 0:50–0:58 | Gatekeeper checks                  | Gatekeeper validates the mod and runs deterministic simulations before it can go live.                               |
| 0:58–1:12 | SHIPPED and SHOWCASE               | The winning idea ships into the running game, credits its contributors and gets a live showcase.                     |
| 1:12–1:30 | Architecture and trust boundaries  | The server owns the game. Generated mods run inside QuickJS, and the overlay receives read-only snapshots.           |
| 1:30–1:50 | Codex story and build evidence     | Codex built ChatForge from an empty folder in one main thread. The Codex SDK is also the Builder inside the product. |
| 1:50–2:02 | The community-built keep and repo  | Every round leaves a mark. Twitch chat doesn't just play the game. Chat ships the game.                              |

The recording commands are `pnpm demo:take` for Twitch plus SIM and `pnpm demo:take --sim --minutes 6` for a labelled dry run. Stop any running server first; the take creates a fresh season and preserves Twitch tokens. `pnpm demo:edit <take>` renders from that take's timeline and the actual recordings. The lead must inspect the public Twitch popout, choose a real round containing visible `!idea`, `!vote`, and the shipped announcement, verify the filtered-idea demonstration separately, and replace the README's placeholder with the final public YouTube URL. Never claim the SIM-only draft demonstrates a real Twitch interaction.
