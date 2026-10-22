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
