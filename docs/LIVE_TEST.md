# M2 human Twitch verification

The automated M2 checks use fake local Twitch servers. The hand-off smoke validates the real app's authorize redirect but never follows it, logs in, or sends a Twitch chat message. Only the human performs the steps below. No API keys need to be pasted into chat.

## Start in PowerShell

From the repository root, with Node 24 and pnpm 10:

```powershell
corepack pnpm@10.18.2 install --frozen-lockfile
corepack pnpm@10.18.2 build
corepack pnpm@10.18.2 start
```

The existing ignored `.env` contains the Twitch app credentials. Do not overwrite it. The registered redirect must remain `http://localhost:3000/auth/twitch/callback`; keep `PORT=3000` for this hand-off. With the server running, the optional safe automated check is `node scripts/verify-twitch-handoff.mjs` in another terminal. It temporarily runs Crowd Sim at hype intensity and restores the previous source settings.

## Connect the actual account

1. Open **http://localhost:3000/dashboard/** (use `localhost`, not a LAN address).
2. Set **Source → Twitch only**. Click **Connect / reconnect Twitch**. The human signs into the streamer account and approves permissions. The same account is the bot.
3. Expect return to the dashboard, your account name, token health **healthy**, EventSub **connected**, and a status for each of the seven subscription types. No token appears in the page or logs. Tokens are stored locally in ignored `runtime/secrets/twitch.json`.
4. If authorization fails or expires, click connect again. OAuth state expires after five minutes and cannot be reused. Browser cookies must be enabled. Login initially opened on `127.0.0.1` is redirected to the registered `localhost` host before setting its state cookie.
5. Open **http://localhost:3000/overlay/** in another tab. For OBS, add a 1920×1080 Browser Source at **http://localhost:3000/overlay/?mode=overlay**.

## Send real chat yourself

Use the channel's Twitch chat (the channel does not need to be live for ordinary chat):

| Human action                                 | Expected result                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `!join`                                      | Hero with your display name; Twitch user ID is the identity. No SIM tag on a real viewer.                            |
| `!idea Give heroes tiny lantern projectiles` | One pending Idea Inbox entry with Twitch source and your name. No build yet.                                         |
| Repeat the same idea after 10 seconds        | Duplicate ignored; inbox does not grow.                                                                              |
| `!idea https://example.com`                  | Log says links rejected; no inbox entry.                                                                             |
| `!vote 2`                                    | Log records a preview vote. M2 has no active round/card selection.                                                   |
| `!help`                                      | One real bot reply prefixed `?`, listing commands.                                                                   |
| `!forge` (wait 30 seconds after help)        | Bot reports the M2 inbox/round status.                                                                               |
| `!meteor`                                    | Example mod displays a meteor telegraph, then impact (15-second mod cooldown).                                       |
| Type normal chat with auto-join enabled      | Your existing hero is refreshed, not duplicated.                                                                     |
| Click **Send test chat message to Twitch**   | Queue → sent, and a `? ChatForge connection test` message appears in real chat. The button is an explicit real send. |

Join cooldown: 5 seconds; idea: 10 seconds; vote: 2 seconds; help/status: shared 30 seconds per user; mod routing: 1 second plus the registered mod's own cooldown. Up to 200 ideas per M2 process collection round. Restart resets the in-memory round; pending SQLite ideas survive. M3 will call `resetRound()` as rounds begin.

If the channel is in a Shared Chat session, Twitch user-token sends are shared to the linked channels under Twitch's current API behavior. Leave Shared Chat before a private test if needed. Simulator replies are always local.

## Expected capabilities on this non-affiliate channel

| EventSub type                  | Version | Expected availability                                                                                                  |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `channel.chat.message`         | 1       | Expected with `user:read:chat`, broadcaster = bot account.                                                             |
| `channel.follow`               | 2       | Expected with `moderator:read:followers`; account moderates its own channel. Test with another real account following. |
| `channel.raid`                 | 1       | Expected; incoming raid condition, no additional event scope. A genuine incoming raid is needed to fire.               |
| `channel.subscribe`            | 1       | May be refused or accepted but idle without subscription eligibility.                                                  |
| `channel.subscription.gift`    | 1       | Same subscription eligibility limitation.                                                                              |
| `channel.subscription.message` | 1       | Same limitation; specifically a resubscription chat message.                                                           |
| `channel.cheer`                | 1       | May be refused or idle without Bits eligibility.                                                                       |

The application records actual API acceptance and safe HTTP/revocation reasons. It does not infer eligibility just from an `enabled` subscription. Unavailable types do not crash chat or the simulation. Do not purchase anything to test these paths.

## Exercise unavailable events locally

1. Set **Source → Twitch + Crowd Sim**, **Intensity → hype**. Wait a few seconds.
2. Dashboard events/ideas show **SIM**; simulated hero nameplates include **SIM**, with a separate SIM marker even when name collision avoidance hides a label. Vietnamese/CJK names render through system fallback fonts.
3. Over time, the seeded stream generates fake sub/cheer/raid/follow events. Fake subs trigger the meteor example; fake raids trigger Aurora. These are explicitly simulated, not evidence of real Twitch events.
4. Change to **Twitch only**: simulated input stops. Existing simulated heroes remain labeled SIM until they leave the game. No simulated chatter or bot reply may appear in real Twitch chat.
5. Restart the server and check that pending ideas remain in the inbox. Event receipt dedupe also survives restart within the accepted ten-minute delivery window.
6. Optionally disconnect the app in Twitch settings and reconnect in the dashboard. Revoked authorization must stop the EventSub session and show **reconnect Twitch**. Fake-server tests cover keepalive loss and handoff reconnect without needing a real outage.

## Stop and evidence

Press **Ctrl+C** in the server terminal (confirm `Y` if PowerShell's package-manager wrapper asks). Close the browser/OBS test source. Record account connected, enabled/unavailable types, commands observed, and any Twitch refusal status without sharing tokens, `.env`, authorization codes, cookies or full authorize URLs. Full forge-loop end-to-end verification is M5; the M2 hand-off does not claim it.

## Official references checked before implementation

- [Authorization Code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow), [validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/).
- [EventSub WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) and [subscription types/conditions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).
- [Helix Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message).
