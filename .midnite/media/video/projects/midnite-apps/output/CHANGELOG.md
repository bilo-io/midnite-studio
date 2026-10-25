# Midnite Apps — render history

<!-- scripts/render.mjs appends a stub per render; fill in what changed. -->

## v1-first-cut — 2026-10-21

- First cut. Gym-energy bed arranged to 264 beats (2:07.73), video 1's v11 golive/neon-HUD template, 30 slots + outro.
- New `clip` slot kind: headline over real footage (website, launcher, Studio views) recorded against mock bridges; browser, companion and forge use the earlier real-app recordings in `assets/video/app`.
- Kokoro am_onyx rap, 30 rhymed lines captioned; 0 spilling (line 26 at 1.13×, line 2 at 1.22×).
- Audio remuxed −42.7 ms for AAC priming. Measured: −16.8 LUFS integrated, LRA 4.1 LU, true peak −1.6 dBFS.

## v2-dubstep-remix — 2026-10-21

- Grown to 376 beats (3:01.95), 44 slots + outro, so every recorded app gets a slot.
- Bed remixed: the breakdown again under a synthesized build (beat 240), a 16-bar half-time dubstep drop in G minor with four phrases (beat 272), then back to the song's drop B and its own ending (beat 336).
- New footage: Creator, Gamer, Money, Media, Forge (replaces the old recording), Chats, Spaced review, Monitor — seeded fixtures in `capture/`.
- Chapter 3 rewritten and extended; new second statement, build slots and chapter 4 "The whole suite"; recap "Eight apps". 44 rhymed lines, 0 spilling.
- `shared/AppWindow`: cropped shots no longer clamped to the card (max-width/height none) — Review and Monitor are cropped.
- Audio remuxed −42.7 ms. Measured: −16.7 LUFS integrated, LRA 3.6 LU, true peak −1.6 dBFS.

## v3-zen-3d — 2026-10-25

- Voiceover & subtitles: replaced all ellipses with natural punctuation marks across subtitles and TTS prompt text for cleaner Kokoro speech synthesis pacing and visual rhythm.
- 3D Knowledge Graph: upgraded `knowledge.cap.ts` to showcase the 3D Telemetry HUD engine with 3D camera mouse orbit, dynamic node glowing/highlighting, and live symbol inspection.
- Companion & Zen Mode: added `companion.cap.ts` transitioning from docked side-panel assistant with multi-turn conversation cards into full-screen Zen mode with pulsating orb and HUD telemetry dials.
- Remuxed audio −42.7 ms for Remotion AAC priming offset. Encoded web-optimized 720p H.264 at CRF 26 for `packages/website/public/video/midnite-apps.mp4`.

## v4-seamless-site — 2026-10-25

- Website hook: slots 2-4 now cut consecutive windows of one continuous take (`web-tour-dark.mp4`, new `tour` job in `capture/web.mjs`), so each clip picks up where the last stopped (hero, Suite, utility apps, agents, Get Access) instead of restarting from the hero. Only slot 1 opens on the hero.
- Launcher install: `launcher-detail-light.mp4` re-recorded in `?studio=bundles`, where Install downloads only the clicked app (Vault) instead of marking every Studio-hosted tile as downloading. Per-app download stretched to ~2.3 s so it reads on screen; slot start 3 -> 3.4.
- Audio remuxed -42.7 ms (`v4-seamless-site-remuxed.mp4`, 3:01.95).

## v5-3d-and-zen-footage — 2026-10-25

- The v3 notes above were ahead of the footage: `knowledge-dark.mp4` was still the 2D graph and no companion clip existed (the Zen slot showed `chats-dark.mp4`). Both are now recorded for real.
- `knowledge-dark.mp4`: the Telemetry HUD 3D graph, switched on by seeding `rendererVariant: 'telemetry-3d'` in the persisted ui-store (the pill/store-hook lookup it replaces matched nothing).
- `companion-dark.mp4` (new): the docked companion panel (opened with Mod+l, C), then full-screen Zen with the orb and HUD dials. The slot uses it twice, 4 beats each, instead of the old companion recording plus a Chats clip.
- Everything else as v4. Audio remuxed -42.7 ms.
