# Final product pass HUD evidence

These 1920 × 1080 frames are captured from the actual localhost stream with Twitch connected, Crowd Sim enabled and real Codex builds. They are not staged layout replays. The feed contains only ideas admitted by the moderation pipeline; the screenshots do not prove moderation can detect every possible unsafe message.

- [Moderated feed](final-feed.png)
- [Voting](final-voting.png)
- [Live code and sprite preview](final-build-code-sprite.png)
- [Gatekeeper checks](final-gatekeeper.png)
- [Shipped](final-shipped.png)
- [Showcase](final-showcase.png)
- [Next round](final-next-round.png)

The [live report](final-live-report.json) records build results and which outbound Twitch announcements were confirmed sent. The code panel deliberately redacts untrusted free text and unknown identifiers; it is not a verbatim source viewer. In the pictured showcase, the action produced visible effects while the mod also displayed its own recharge message. Gatekeeper checks for an immediate visible response, but cannot guarantee that every generated mod's response matches its intended gameplay semantics.

Earlier M5 screenshots and layout replays were removed as superseded; the [soak report](../soak/report.json) remains available for the prior verification.

## Real Twitch recording

In the later Twitch + Crowd Sim take, the public chat recording shows @vansyson1308 send `!join`, a golden dragon `!idea`, an unsafe file-deletion `!idea`, and `!vote 2`; the bot announced the cards, winner Crabaret Invasion, shipment and `!crabaret` showcase CTA. The recording also shows the next round's cards and `!vote 3`, followed by another shipped showcase. Both winners came from labelled SIM contributors; the real dragon idea did not make those cards. The first rejection message preceded the unsafe Twitch idea and arose from SIM input. A later rejection appeared at the next curation; the stored Twitch idea was marked rejected. The recorded `!vote 2` appears after the winner announcement and is not evidence that it determined that winner. These observations motivated the real-viewer priority and SIM-reply fixes.

## Final demo take

In the final recorded take (Season 7, round 1), @vansyson1308 sent a golden dragon `!idea` at the start of collection. The bot acknowledged it, the Producer placed it as card one, chat voted for it, and the Codex SDK Builder (API-key auth) built Keep Calm and Roar. It shipped credited to @vansyson1308 and the showcase used `!roar`. Other contributors in that take are labelled SIM. The moderation close-up in the demo video comes from the preceding take, where an unsafe idea was refused.
