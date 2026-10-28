Lead QC of the final product pass: APPROVED. The new screenshots are exactly what we need: the keep visibly grew (towers + 7 emblems), the live code view with the crab sprite filling in, Gatekeeper checks ticking, SHIPPED, and a SHOWCASE with a giant purple crab. Moderated feed works.

One root cause to fix first (Part A), then **Milestone M6 — submission kit + demo video pipeline** (Parts B and C).

# Part A — showcase cooldown root cause (small, with tests)
In `final-showcase.png` the mod printed "CLACK! The next crab call is recharging." The code view shows why: the generated mod self-triggers on deploy via `api.every(30, () => { if (api.state.symbol) return; api.state.symbol = true; symbol(); })`, so by the time the host SHOWCASE fires `!crab`, the mod's own cooldown is already running. Fix at the contract level:
- Builder rule (builder AGENTS.md + MOD_API.md): a mod must NOT start its main sequence by itself on deploy; the host SHOWCASE is the intro. Ambient effects are fine.
- Gatekeeper check "showcase-ready": deploy, idle 300 ticks with no triggers → the main sequence must not have fired; then fire the showcase trigger → expected effects appear within N ticks; wait the declared cooldown → trigger again → effects appear again.
- Code view: long lines are rendered in a smaller font (inconsistent); keep one font size and truncate/wrap long lines instead.

# Part B — M6 submission kit (judges read this; make it excellent)
1. **README.md, judges-first:** one-line pitch; a hero GIF/image (from docs/media); "What it does" in 5 bullets; "Watch the 3-minute demo" placeholder link; how a round works (diagram); **How Codex was used** (two layers: Codex built ChatForge from an empty folder in one main thread driven by lead prompts in `brief/prompts/`, and the Codex SDK is the live Builder inside the product — with real numbers: rounds shipped, median build time, tests count, commits); safety & honesty (QuickJS sandbox, Gatekeeper, moderation, SIM viewers always labelled); quick start (`pnpm stream`, Twitch app setup, `.env`); architecture; limitations; license. Keep it scannable.
2. **docs/DEVPOST.md:** the full Devpost write-up using Devpost's sections: Inspiration, What it does, How we built it, Challenges we ran into, Accomplishments we're proud of, What we learned, What's next for ChatForge, Built with. Factual, numbers from our own reports, no hype claims we can't back.
3. **docs/ARCHITECTURE.md:** final mermaid diagram(s) of the forge loop and trust boundaries; also export one PNG diagram into docs/media for the video.
4. **docs/media/** curated set: 6–8 best final screenshots + 1 short GIF (≤ 8 MB) of a SHOWCASE.
5. Remove/archive outdated docs and images; make sure nothing in the repo contains secrets or personal data.

# Part C — demo video pipeline (the lead + human will run the real take)
The video must be ≤ 3:00, public on YouTube, and show the project **working on Twitch** and **how Codex was used**. Judges may not run the project; the video carries the submission.
1. `pnpm demo:take` (PowerShell-safe script): runs `demo:reset`, starts the stream server + Forge (Demo preset, Twitch + Crowd Sim, Director enabled), then records two synchronized 1920×1080 videos with `playwright-core` + installed Chrome: (a) the overlay `?mode=full&clean=1`, (b) the PUBLIC Twitch popout chat `https://www.twitch.tv/popout/vansyson1308/chat` (read-only, no login). It writes `runtime/recordings/<take>/` plus `timeline.json` (stage changes with timestamps from the server) and stops after 2 completed SHOWCASE stages or `--minutes`. It must not need any credential typed into the browser.
2. `pnpm demo:edit <take>`: ffmpeg (installed at `C:\ProgramData\chocolatey\bin\ffmpeg.exe`) assembles the final cut following `docs/DEMO_SCRIPT.md`:
   - 0:00–0:12 hook (best showcase moment) + title card "ChatForge — Twitch chat ships the game. Live."
   - Problem → idea (≤ 20 s).
   - One full real round on Twitch, split screen overlay (~70 %) + real Twitch chat (~30 %): !idea in chat → card; !vote → winner; CODEX IS FORGING with live code + sprite drawing; Gatekeeper checks; SHIPPED; SHOWCASE; the bot's real chat announcement. Long waits sped up with an on-screen "×4" label (never hide that time was compressed).
   - How it works (architecture PNG + sandbox/Gatekeeper/moderation, include a clip of an unsafe idea being filtered).
   - Built with Codex: empty folder → product, one main thread, the lead prompts, commit/test/build-time stats, and the Codex SDK as live Builder.
   - Outro on the community-built keep + repo URL.
   - Burned-in captions for all narration. Narration via OpenAI TTS using the API key in `.env` (pick an available TTS model id from `/v1/models`; clear, energetic English voice). No copyrighted music (silence or the game's own synthesized sfx). An on-screen note: "Viewers tagged SIM are a labelled simulated crowd; @vansyson1308 is a real Twitch account."
   - Output `runtime/recordings/<take>/chatforge-demo.mp4` (H.264, 1080p, `-preset veryfast`), ≤ 2:55, plus a `chatforge-thumbnail.png` (1280×720).
3. Validate the pipeline now with a **dry take**: Crowd Sim only, `--minutes 6`, then `demo:edit` → a draft video. Report its duration, size and a contact sheet (one frame every 10 s) saved as PNG. The real take with real Twitch chat will be run by the lead afterwards.
4. Write the narration script in `docs/DEMO_SCRIPT.md` (≤ 330 words) with timestamps.

Done = Part A tests + all tests + CI green, M6 docs committed, pipeline works on a dry take, draft video + contact sheet produced, processes stopped, `pnpm clean:runtime` (keep `runtime/recordings`). Report: usual structure + draft video path/duration + any manual step the human must do.
