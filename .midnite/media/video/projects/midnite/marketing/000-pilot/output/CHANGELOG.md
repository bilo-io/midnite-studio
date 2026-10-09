# Pilot — render history

<!-- scripts/render.mjs appends a stub per render; fill in what changed. -->

## v7-sixty — 2026-09-20

- **A minute long, and the soundtrack is now built rather than found.**
  `scripts/make-pilot-soundtrack.mjs` arranges the same 14-second sting into
  `input/soundtrack-60s.wav` and the picture is cut to *its* bars. The bass is
  gated to three irregular attacks over the opening four bars, plays the track's
  own pattern from bar 4, ramps out under a rising highpass and an accelerating
  beat repeat for the build-up, and comes back on bar 19 boosted and wobbling,
  with extra sub hits an octave down on every downbeat and offbeat. On bar 30 the
  track's own ending is spliced back in and decays to silence at frame 1790.
- **The bar was wrong before.** Autocorrelating the waveform puts the repeating
  unit at three bars — 223 608 samples, 152.11 frames, r=0.88 — where v3 looped
  four (r=0.36) on the strength of onset positions alone. Every cut in this
  version is on a bar of the real phrase.
- **Eight slides**, the four from v3 plus the GitHub tour, the workspace
  optimiser, the AI companion and the loops panel. The agent slide's footage is
  replaced: `midnite-ai-agents-terminal` shows the picker opening and Claude Code
  launching into the pane, where `midnite-agent-cli-providers` showed a menu over
  an empty terminal.
- **The mark is persistent.** There is exactly one `MidniteWordmark` in the
  composition and it is never unmounted: it lands and builds the lockup in the
  open, flies up on the first cut — the name folding back into it as it goes —
  and spends the body of the film at the head of the caption line, where the `▸`
  used to be. At the close it flies back down and the name unfurls again. The
  caption is left-aligned to the window's edge now, because a persistent object
  cannot move between cuts just because the next caption is shorter.
- **The closing line wears the ramp as light rather than as ink.** New
  `shared/ShimmerLine`: the brand gradient clipped to the glyphs *and their
  stroke* and blurred into a halo, the readable copy solid on top of it, and a
  narrow highlight crossing every couple of seconds.
- `AppWindow` gained `playbackRate`, and the warning in its docs against
  combining it with `trimBefore` is withdrawn — reading `getMediaTime` and
  `useMediaStartsAt` shows the two compose exactly. Three slides needed both.
- `Swoosh.tsx` is `Sfx.tsx`: the same peak-aligned mount now also carries the
  riser that runs the length of the build-up and the impact under the drop.
- Fixed before shipping, all by looking at the frame each slide *opens* on: the
  GitHub slide opened on a loading skeleton (moved to 1.7s, which cost it half a
  bar and left it at 1.65× rather than the 2× asked for), the optimiser opened on
  an idle "Smart Scan" button (moved to 0.87s at 0.88×), the companion opened on
  a dashboard with nothing happening (moved to the frame the companion is
  summoned from the menu), and the loops panel was caught mid-slide-in.
- `SLIDES` now carries each clip's measured duration and the module throws if a
  slide asks for more source than exists. Overrunning a clip freezes its last
  frame, which on a screen recording looks exactly like the app having hung, and
  nothing in a render or a still says so.
- Two speeds are not what was asked for and are worth knowing: **github 1.65×,
  not 2×** (6.06s of clip with 1.7s of loading in front of it cannot fill two
  bars at any faster rate) and **loops 0.70×** (it is the only clip long enough
  to carry the drop). The knowledge graph, git graph, browser and optimiser run
  between 0.88× and 0.90× so each lands inside its own footage.

## v4-damion-intro — 2026-09-19

- The brand face follows the website to **Damion**. midnite-studio `fc36d817`
  (*feat(website): set the wordmark in Damion*, #470) moved the site off Kaushan
  Script to another SIL OFL script in the same hand; a video and a landing page
  are the same brand seen twice, so the face here moves with it.
- Carried the website's per-face clip headroom with it: the brand half is padded
  0.15em, up from nothing. `rainbowText()` is `background-clip: text` and only
  paints inside the element's box, and Damion's ink runs 0.104em past its advance
  box over "Midnite" (Kaushan Script's ran 0.051em), so the final `e`'s tail was
  going unpainted and the name read as cut off.
- New intro build. Frames 0–38 are the crescent alone on the centre line — the
  name is not there at all, not merely transparent. On the first hit the streak
  rakes across and the name unfurls out of the mark under it (18 frames), then
  "Studio" types with a caret from frame 59 and lands on 78, 24 frames of stillness
  before the roster arrives on `BEAT.agents`. Everything from `BEAT.lockup` and
  the streak's own 20-frame crossing; nothing new in the grid.
- `MidniteWordmark` grew `reveal`, `qualifierChars` and `caret` for that, all
  layout-neutral when unset — the close scene draws the same lockup it always did.
- The logo-only beat runs at 0.72 opacity rather than 0.35. The old split was from
  when the pre-roll was a hint of what was coming; it is now the shot.
- Fixed while building it, both measured on stills rather than eyeballed: the mark
  sat 21px left of centre through the logo beat (a `border-box` will not shrink
  below its own padding, so the gap to the mark moved from the wrapper's padding to
  the content's margin), and the caret sat at the end of the space "Studio" was
  reserving rather than after the character it had just typed.

## v3-slides — 2026-09-19

- Each feature claim is now its own slide, over the recording of midnite doing
  it: the git graph and its repos, the agent CLI picker, the knowledge graph,
  and the browser docked beside a session. The four claims used to be a list of
  typed lines on an empty stage.
- Runtime 14.2s → 21.0s. The sting carries 14.0s of music, so its four-bar
  bass-and-drums groove now plays twice: the track is mounted a second time,
  203 frames (four bars, measured by autocorrelation at 141.99 BPM) behind
  itself, and the two copies crossfade over two frames on the dip before a hit.
  No second audio file — see `beats.ts` for the arithmetic and `Pilot.tsx` for
  the two `<Audio>` mounts.
- Every slide cut is still on an onset: 141, 243, 344, 446 and 545, each two
  bars apart, verified with `tools/cut-detect.py` on this render (picture
  changes at 143, 246, 346, 447 and 547 — the two- to three-frame lag is the
  caption fading up, the window itself is a hard cut).
- New `shared/AppWindow`: the rounded, bordered, bloom-lit card every midnite
  video will show the app in, with a source-pixel `crop` that covers into a
  fixed card size so a cropped clip does not resize the window between cuts.
- Clip windows are measured, not guessed — the densest 3.4s of activity in each
  recording, per `cut-detect.py`. Two of them moved after the first render
  because the *first* frame was dead: the agent slide opened on a closed picker,
  the browser slide mid tab-switch on a blank pane.
- Cropped the "17 commits behind HEAD" banner off the knowledge-graph recording;
  it is true of the machine it was recorded on and reads as a warning otherwise.
- Dropped "a GitHub Project as a board" — there is no recording of the board in
  `assets/video/app/`, and the knowledge graph took the slot. Worth shooting.

## v2-scored — 2026-09-19

- Scored to `soulprodmusic-own-it-logo`. Every cut, entrance and swoosh now sits
  on an onset detected by `tools/audio-envelope.mjs` and recorded in `beats.ts`;
  verified on the render with `tools/cut-detect.py` (picture changes at f141 and
  f342 = the 4.70s and 11.40s onsets).
- Runtime cut from 6.0s to 14.2s — the sting carries 14.0s of music and 4.7s of
  trailing silence, so the picture ends with the music rather than with the file.
- Agent marks now in brand colour (`-color` cuts, accents from midnite-studio's
  own roster) and the full 11-agent roster rather than 6.
- Added four swooshes, picture and sound: a raking brand-coloured streak on each
  cut, and a whoosh positioned so its peak lands on the beat.
- Four product claims typed out, one per hit, drawn from midnite-studio's pillars.
- Fixed: the lockup jumped 75px when the agent row mounted — the row is now
  always in the layout and only its opacity is animated.
- Fixed: the closing tagline was the rainbow ramp clipped to 38px type and read
  as grey mush over the backdrop; it is solid `FG.muted` now.

## v1-smoke-test — 2026-09-19

- First render in this repo: proves assets sync, fonts load, the shared layer
  resolves and `scripts/render.mjs` files the result under a nested project id.
