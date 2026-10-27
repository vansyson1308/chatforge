# HUD evidence

Captured at 1920×1080 with installed Chrome. The `m5-*` images are actual frames from the SIM-only Producer/Codex soak; they show the build that ran during that test. A later client-only correction prevents long season/round labels and the build headline from overlapping. The `layout-preview-*` images are regenerated from that corrected client.

Real soak phases: [collecting](m5-collecting.png), [curating](m5-curating.png), [voting](m5-voting.png), [approval](m5-streamer_approval.png), [building](m5-building.png), [testing](m5-testing.png), [deploying](m5-deploying.png), [live](m5-live.png). Soak outcomes are in [the report](../soak/report.json).

The [failure frame](m5-failed.png) shows the intentionally stopped voting round used to make a safe restart window; it is not a spontaneous failed build.

The [late-stream screenshot](m5-late-stream-10-patches.png) was captured during the real SIM-only soak after the tenth generated mod went LIVE; the HUD in this frame precedes the client-only text-fit correction described above.

Layout replays are explicitly labelled in the image. They reuse prior real cards and run a saved real mod in QuickJS, but their stages and votes are fixtures. The [twelve-emblem layout](layout-preview-twelve-emblems.png) duplicates saved card metadata with unique preview IDs to test the late-stream layout; it is not evidence of twelve real shipped mods. Other replays: [collecting](layout-preview-collecting.png), [voting](layout-preview-voting.png), [approval](layout-preview-streamer_approval.png), [building](layout-preview-building.png), [testing](layout-preview-testing.png), [live](layout-preview-live.png), [Hall](layout-preview-hall.png), [transparent overlay](layout-preview-transparent.png).

To reproduce the replay after `pnpm build` in PowerShell:

```powershell
$env:CHATFORGE_CAPTURE_M4='1'
node scripts/verify-forge-handoff.mjs
Remove-Item Env:CHATFORGE_CAPTURE_M4
```

The browser check owns and cleans its server, Chrome instance and temporary database. It does not connect Twitch or call AI.
