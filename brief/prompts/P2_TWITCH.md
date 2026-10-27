Lead QC of M1: APPROVED. Perf gates are excellent (avg 0.36 ms, p99 1.7 ms), fps 96 avg, full-world rollback + the new declaration/schedule contract are exactly right, and MOD_API.md is a strong LLM-facing contract. The new screenshot is a clear step up (label plates, per-viewer looks, meteor trail, torch glow, filling telegraph). Remaining visual notes go to M4 (heroes still bunch around the keep; foreground ground plane is empty).

Mark M1 complete in AGENTS.md and start **Milestone M2 — Twitch integration + Crowd Sim**. Time budget: aim to finish in one focused run.

## Context you need
- `.env` already contains real `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` for the app "ChatForge Live" (confidential client, category Chat Bot, redirect `http://localhost:3000/auth/twitch/callback`). Never print or commit them.
- The streamer's channel is brand new and NOT an Affiliate: sub/cheer events may never fire live, and some subscription types may be refused. Handle that gracefully (mark capability unavailable, keep running) — the Crowd Sim covers those paths.
- The streamer's own account is also the bot account.
- Read the official Twitch docs before coding (dev.twitch.tv/docs: Authentication → authorization code grant flow + validating tokens; EventSub → WebSocket transport (welcome, keepalive, reconnect, revocation), subscription types; Chat → send chat message). Do not rely on memory for message shapes.

## 1. Auth (apps/server)
- `GET /auth/twitch/login` → redirect to Twitch authorize with scopes `user:read:chat user:write:chat user:bot channel:read:subscriptions bits:read moderator:read:followers` and a random `state` (CSRF, single use, short TTL). `GET /auth/twitch/callback` exchanges the code, fetches the user via Helix `/users`, stores tokens in `runtime/secrets/twitch.json` (gitignored; never logged; redact in errors).
- Validate the token on startup and hourly (`/oauth2/validate`, Twitch requires periodic validation); refresh proactively and on 401; if refresh fails, surface "reconnect Twitch" in the dashboard instead of crashing.
- Bind the HTTP server to 127.0.0.1. Admin/dashboard endpoints are localhost-only. Overlay WebSocket is read-only.

## 2. EventSub WebSocket client
- Connect to the EventSub WS endpoint, handle `session_welcome` and create subscriptions within the required window via Helix `POST /eventsub/subscriptions` (transport websocket + session_id).
- Subscriptions: `channel.chat.message` (broadcaster + bot user ids), `channel.follow` v2, `channel.raid` (to_broadcaster), `channel.subscribe`, `channel.subscription.gift`, `channel.subscription.message`, `channel.cheer`. Record per-subscription status (enabled / unavailable + reason) for the dashboard.
- Keepalive-timeout detection → reconnect with backoff; honor `session_reconnect` (connect to the new URL, keep the old socket until the new welcome arrives, no duplicate subscriptions); handle `revocation`; dedupe by message id; never process a message twice.
- Map notifications into ChatForge domain events: `chat` (userId, login, displayName, text, badges, isBroadcaster/isMod), `twitch:sub|cheer|raid|follow` → forwarded to the ModHost event bus (already exists from M1 dev controls).

## 3. Chat out
- Helix Send Chat Message with an outbound queue: rate limiting, max length, dedupe of identical messages within a window, prefix `⚒`. Used for round announcements (M3) and `!help`.

## 4. Chat command layer (source-agnostic)
- Parser + router: `!join`, `!idea <text>`, `!vote <n>`, `!help`, `!forge` (status), and mod-registered commands → ModHost. Unknown commands ignored.
- Sanitizer: strip control/zero-width/bidi-override chars, collapse whitespace, cap lengths, detect links (ideas with links rejected), emote-only messages ignored for ideas.
- Per-user cooldowns (idea, vote, join), per-user idea dedupe, global idea flood cap per round. Viewer identity key = Twitch user id; display name for labels (support non-Latin names: make sure the overlay font stack has CJK/Vietnamese fallbacks).
- `!idea` entries go to an **Idea Inbox** (in memory + `node:sqlite` table `ideas` with author, text, status, createdAt, source) — the Producer consumes it in M3. Chat any message also auto-joins the author's hero (configurable).

## 5. ChatSource abstraction + Crowd Sim
- `CHAT_SOURCE` accepts `twitch`, `simulator`, or `twitch,simulator` (both at once).
- **Crowd Sim** (`packages/shared` or `apps/server/src/crowd-sim`): seeded, ~20 personas with distinct styles (hype, builder, chaos gremlin, lurker, troll…), a curated bank of ~80 fun, buildable, family-friendly feature ideas that fit the Mod API (e.g. "slimes wear tiny crowns and drop gold", "every raid summons a dragon ally", "rain of rubber ducks when someone cheers") plus ~10 deliberately bad ones (off-topic, spam, slurs replaced by placeholder tokens, link spam) to exercise moderation in M3. Generates joins, ideas, votes, chatter, and fake sub/cheer/raid/follow at configurable intensity (`chill | normal | hype`).
- **Honesty rule:** simulated viewers are always visibly marked (a small "SIM" tag on their labels in the overlay and in the dashboard log). Simulated messages are never posted into real Twitch chat. Our demo must never pass simulated viewers off as real people.

## 6. Dashboard (apps/dashboard, React) — functional, not yet pretty
- Connect / reconnect Twitch, show account, token health, EventSub session state, per-subscription status table, chat source toggle + Crowd Sim intensity, live event log (sanitized text only), "send test chat message" button, Idea Inbox list.

## 7. Tests
- A fake EventSub WebSocket server (welcome, keepalive, notification, reconnect, revocation, duplicate message) and a fake Helix server; tests for: subscription creation timing, reconnect without duplicates, dedupe, revocation handling, token refresh on 401, CSRF state rejection, sanitizer edge cases (bidi, zero-width, long, links, emoji, Vietnamese/CJK names), cooldowns, Crowd Sim determinism, outbound rate limiter.
- No test may hit real Twitch.

## 8. Live verification hand-off
You cannot log in to Twitch yourself. Write `docs/LIVE_TEST.md`: exact steps for the human (start command, URL to open, what to click, what to type in chat, what should appear on overlay/dashboard). Start the server once, verify `/auth/twitch/login` redirects with correct scopes (do not complete login), then stop it. The lead will run the live test with the human right after your report.

Done = everything green locally + CI, docs (ARCHITECTURE, SECURITY threat model for OAuth/tokens/chat input, LIVE_TEST) + journey updated, commits pushed, processes stopped. Report in the usual structure plus: subscription types and their expected availability for a non-affiliate channel, and the exact live-test steps.
