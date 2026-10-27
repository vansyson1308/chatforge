# M4 HUD evidence

Captured with playwright-core and installed Chrome at 1920x1080. No browser downloads.

## Actual real-system soak

These are screenshots from the three consecutive paid Producer + Codex rounds, with a real worker and hype Crowd Sim, before the final text-wrap, moon/safe-area and sprite-cache refinements:

- [Collecting](1-collecting-0.png)
- [Voting](1-voting-0.png)
- [Winner reveal](1-streamer_approval-0.png)
- [Building](1-building-1.png)
- [Testing](1-testing-1.png)
- [Shipped](1-live-1.png)
- Feature in action: [dragon forge](1-mod-in-action.png), [marshmallows](2-mod-in-action.png), [pizza](3-mod-in-action.png)
- [Hall of Patches](hall-of-patches.png), [transparent mode](transparent-overlay.png)

No Gatekeeper repair happened in these three rounds; no synthetic repair is presented as live evidence. Sources, credits, exact timings, thread and hashes are in [sample-mods](../sample-mods/README.md).

## Final layout review (replay)

`layout-preview-*` images carry an explicit LAYOUT REPLAY label. They reuse the saved real cards/reports and execute the saved dragon mod inside QuickJS against a simulated world. Stage/vote values are presentation fixtures, not a second paid live test. These show the final client after wrapping titles/credits, moving the moon, preserving pixel aspect in transparent mode, streaming actual Gatekeeper check outcomes and caching actor sprites/shadows:

[Collecting](layout-preview-collecting.png) · [Voting](layout-preview-voting.png) · [Winner](layout-preview-streamer_approval.png) · [Building](layout-preview-building.png) · [Checks](layout-preview-testing.png) · [Shipped](layout-preview-live.png) · [Hall](layout-preview-hall.png) · [Transparent](layout-preview-transparent.png).

Reproduce after `pnpm build` in PowerShell:

```powershell
$env:CHATFORGE_CAPTURE_M4='1'
node scripts/verify-forge-handoff.mjs
Remove-Item Env:CHATFORGE_CAPTURE_M4
```

The browser check owns and cleans its server, Chrome instance and temporary database. It never connects Twitch or calls AI.
