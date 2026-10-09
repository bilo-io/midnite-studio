# Editorial script — `midnite/marketing/001-golive-promo`

The go-live promo for Midnite Studio. **88.0 seconds, 1920×1080, 30fps**, cut to
`assets/audio/curated/music/The_Iron_Aria.mp3`.

Composition `MidniteGolivePromo`, under
`video-editor/src/projects/midnite/marketing/001-golive-promo/`. This document is
the source of truth: a fresh session should be able to rebuild or extend the cut
from it alone.

Brief: [`input/BRIEF.md`](input/BRIEF.md), which carries all three rounds of
edits and the factual corrections made while verifying them.

**The film is a loop.** Frame 0 and frame 2639 are the same picture — the
crescent, centred on pure black, its glow breathing — and everything between
arrives out of that mark and goes back into it. That is a structural constraint,
not a flourish: several decisions below exist only to keep it true, and they are
flagged where they are.

---

## 1. Environment

```bash
export PATH="/opt/homebrew/bin:$PATH"     # node/npx/ffmpeg are Homebrew installs
cd video-editor && npm install            # once per checkout
npm run dev -- --no-open                  # → http://localhost:3000/MidniteGolivePromo
```

```bash
node scripts/render.mjs midnite/marketing/001-golive-promo check --still 1383
node scripts/render.mjs midnite/marketing/001-golive-promo edits --version v3
```

**A real ffmpeg is installed** (`/opt/homebrew/bin/ffmpeg`, 9.0.2) and every
measurement below used it. Earlier revisions of the README claimed there wasn't
one; that has been corrected. Contact sheets — `-vf "fps=4,scale=470:-1,tile=5x4"`
— are the single most useful tool in this project and they need filters, which
Remotion's bundled build does not have.

A **scaled proof render** is the other tool worth knowing about. The turbulence
filters cost per pixel, so `--scale=0.35` renders the whole 88 seconds in **one
minute** against six at full size, and a 1fps contact sheet of that is enough to
catch a wrong shot, an unreadable line or a missing layer. Only the theme
crossfades and the loop seam need full-size stills.

```bash
npx remotion render MidniteGolivePromo /tmp/proof.mp4 --scale=0.35 --muted
```

Four generators have to have been run, and all four have a `--check` mode so CI
can tell you if they have not:

```bash
node scripts/make-keyclick.mjs        # assets/audio/sfx/keyclick-{1..4}.wav
node scripts/make-logo-cuts.mjs       # -white / -color / -ink cuts
node scripts/make-track-envelope.mjs  # …/001-golive-promo/energy.ts
node scripts/sync-assets.mjs --prune  # → video-editor/public/
```

> `--prune` on the last one is not optional housekeeping. `sync-assets` copies
> but does not delete, so a logo cut that stops being generated stays in
> `public/` and goes on being the file the composition loads. That is exactly how
> a retired Aider mark survived a brand change — see §3.

---

## 2. Ground truth — the track

`The_Iron_Aria.mp3`, 44.1kHz stereo, **98.93s** container, **audible to 97.40s**
(`tools/audio-envelope.mjs --onsets`). The cut uses the first 88.0s and fades the
last 1.9s of it; the track is not exhausted, the story is.

### The bar

**1.702694s = 51.0808 frames = 140.95 BPM.** Anchor (bar 0) at **15.443s =
frame 463.29**, the track's first big hit.

Measured with a 600Hz onset-strength envelope — half-wave-rectified two-sample
RMS difference, peak-picked against a rolling median — then fitted by least
squares over ten onsets that sit on a bar line. Residuals at the four anchors
that matter:

| bar | predicted | measured | strength |
|---|---|---|---|
| 0 | 15.443s | 15.443s | 0.61 |
| 6 | 25.659s | 25.675s | 0.65 |
| 18 | 46.092s | 46.092s | 0.59 |
| 32 | 69.929s | 69.930s | 0.56 |
| 36 | 76.740s | 76.740s | **0.64 — the loudest onset in the piece** |

One grid runs the whole track: bars −7, −5, −3 and −2 also land on measured
onsets back in the quiet intro, so the intro's typing and the outro's lockup are
counted in the same unit.

> **If you re-measure this, do not start with autocorrelation.** The onset
> envelope's ACF peaks at 187 BPM (r = 0.32), with 174.5 and 163.5 close behind
> and the true 140.95 not in the top twenty. The piece is cinematic and mostly
> quiet, and the quiet parts are not on the grid the loud parts are. The bar came
> out of *reading the onset list* — five accents 0.855s apart between 39s and
> 43s — and then fitting to them.

### The acts, as the track plays them

| s | frame | bar | what the music does |
|---|---|---|---|
| 0.0 | 0 | −9 | sparse, almost silent; one weak swell at 6.89s (bar −5) |
| 15.44 | 463 | 0 | **first hit**, 0.61 — full arrangement enters |
| 29.09 | 872 | 8 | section change: mix empties, texture turns rhythmic |
| 39.30–42.72 | 1179–1282 | 13–16 | rising accents, 0.855s apart |
| 44.40 | 1332 | 17.3 | near silence — the breath |
| 46.09 | 1383 | 18 | **the drop**, 0.59 |
| 46–68 | 1383–2047 | 18–31 | sustained; strong onset on bars 19, 20, 22, 23, 24, 26, 27, 28, 30 |
| 68.23 | 2047 | 31 | breakdown — quietest since bar 0 |
| 69.93 | 2098 | 32 | music returns, 0.56 |
| 76.74 | 2302 | 36 | **loudest onset in the track**, 0.64 |
| 80.15 | 2404 | 38 | the last boom, 0.51 (cluster peaking 0.60 at 79.59s) |
| 81–87.5 | 2456–2625 | 39–42 | wind-down |
| 88.0 | 2640 | 42.6 | silence |

All of this is in `beats.ts`, which is the only file in the project allowed to
choose a frame number.

### The bass, per frame

`energy.ts` carries three measurements for each of the 2640 frames, generated by
`scripts/make-track-envelope.mjs` from the track's low end (two cascaded 2-pole
low-passes at 140Hz, 24dB/octave, so a snare at 400Hz is 20dB down and the logo
does not flinch on the backbeat):

- **`THUMP`** — where the woofer cone is. RMS over three frames, normalised
  against the 99th percentile, with an instant attack and a 0.86-per-frame
  release. The release is the load-bearing part: this track's low end is almost
  entirely transient, and the raw envelope is zero between kicks, so a logo
  scaled by it would flick for one frame and sit still for fifteen.
- **`PUNCH`** — the strike rather than the displacement. How far above its own
  trailing average the bass is, sharpened and clamped. Near zero for most of a
  bar and close to 1 on the frames a drum lands.
- **`BANDS`** — eight octave-wide bands from 55Hz to 7040Hz, each normalised
  **against itself**. This is the spectrum the mark's waveform ring is drawn
  from, and the per-band normalisation is the whole of why it reads as one: a
  mix is some thirty decibels louder at 110Hz than at 7kHz, so bands scaled
  against a common maximum give a ring where two spokes swing the full radius
  and the other six are a flat stub that never moves.

It is a build step and not a component because a Remotion frame has no decoder,
and because reading audio inside the frame loop would make the picture a function
of something other than the frame number — which is the one property every
animation in this repo is built on.

---

## 3. Asset inventory

### Music and sound

| file | what | provenance |
|---|---|---|
| `audio/curated/music/The_Iron_Aria.mp3` | the track | supplied |
| `audio/sfx/dragon-studio-futuristic-transition-390304.mp3` | `SFX.big`, peak f51 | stock, measured |
| `audio/sfx/trading_nation-deep-strange-whoosh-183845.mp3` | `SFX.light`, peak f30 | stock, measured |
| `audio/sfx/soundreality-riser-wildfire-285209.mp3` | `SFX.riser`, ledge f210 | stock, measured |
| `audio/sfx/primalhousemusic-…-impactor-e-188986.mp3` | `SFX.impact`, peak f7 | stock, measured |
| `audio/sfx/keyclick-{1..4}.wav` | the keyboard | **generated**, `scripts/make-keyclick.mjs` |

The keyclicks are synthesised rather than sourced: `assets/audio/sfx/` is
cinematic one-shots, none of them a keystroke, and a typing sound is the opposite
kind of sample — 80ms, played ~190 times, where the variation *between* copies is
the effect. Two layers per strike (a band-limited noise click, and a damped
resonance a few milliseconds later for the bottom-out), four variants that move
the travel time, the resonance pitch and the noise tilt together. Seeded LCG, so
re-running writes byte-identical files and `--check` means something.

### Logos

| file | cut | note |
|---|---|---|
| `logos/midnite/midnite-mark-white.svg` | white | the dark stages |
| `logos/midnite/midnite-mark-ink.svg` | `#171726` | the light stage |
| `logos/agents/aider.svg` | **self-coloured** | replaced mid-build with green bit-art |
| `logos/agents/grok-ink.svg` | `#171726` | **new** — Grok's accent is white |
| `logos/agents/*-color.svg` | brand accents | the 11-mark roster |
| `logos/git/logo-{github,gitlab,bitbucket,azure-devops}.svg` | vendor | supplied mid-build |
| `logos/git/logo-github-white.svg` | white | GitHub's is flat `fill="black"` |

`scripts/make-logo-cuts.mjs` now handles three shapes of source mark:

- **`currentColor`** — the original case. Re-filled white, and with an accent
  where the roster records one.
- **one flat brand colour** — GitHub's black, and Claude, Cursor, Codex, Copilot
  and Cline, whose vendor files ship painted in exactly the hue midnite's roster
  already records as their accent. Those five need no configuration at all: the
  accent *is* the token, found rather than listed, which keeps the roster the only
  place an agent's colour is written down.
- **real art** — Antigravity's masked spectrum and Aider's bit-art `a`. No
  derived cuts; flattening either would destroy what makes it that mark.

> **Two bugs here were invisible and are now checked.**
>
> Aider's mark was replaced with self-coloured bit-art, which has no
> `currentColor` and so is skipped entirely — and `aider-white.svg`, cut from the
> *previous* mark, stayed on disk being the file `AgentLogo` loaded. The roster
> drew a logo the brand had stopped using and `--check` passed. It now fails on
> any cut nothing generates, and `sync-assets --prune` removes the copy in
> `public/`.
>
> Grok's accent in the roster is `#000000`, which is invisible on midnite's page,
> so the cut substitutes white. That is right on the dark stage and is **no mark
> at all** on the light one — and stage 2 deals the whole roster onto white paper.
> A still at f563 was a blank frame under a caption. Hence `grok-ink.svg` and
> `AgentLogo`'s `tone="ink"`, which is `color` for every other agent.

> The forge marks are deliberately **not** normalised onto one grid the way the
> agent marks are. A row of forges is not a matched set and pretending otherwise
> would take away the only thing that makes each one recognisable. What that
> costs is optical weight, which `ForgeLogo`'s `TRIM` table pays per mark —
> measured off a rendered row, not computed from the viewBoxes.

### Footage

Thirteen shots from eleven recordings. The seven original takes are 2912×1758;
the six delivered in the second round are 1920×1160. Those two aspects are
1.6564 and 1.6552 — the same to a thousandth — so both cover the card with
nothing clipped beyond the one explicit crop below.

`seconds` is `ffprobe`'s container duration. These are variable-rate recordings
and frame count ÷ nominal fps is **not** it.

| clip | s | used for | window (source s) | rate |
|---|---|---|---|---|
| `midnite-agent-cli-providers.mov` | 16.73 | Launch any agent | 13.80–15.53 | 1 |
| `midnite-video-terminal-git-graph-repos.mov` | 5.19 | Manage multiple git repos | 0.90–2.60 | 1 |
| ″ | ″ | Watch your swarm | 3.00–3.68 | **0.40** |
| `midnite-github-integration.mov` | 6.055 | Manage your forge | 4.47–5.96 | **0.88** |
| `midnite-studio-browser.mov` | 7.572 | Dockable browser | 2.50–4.20 | 1 |
| `midnite-optimiser.mov` | 5.562 | System monitor | 3.60–5.30 | 1 |
| `midnite-video-knowledge-graph.mov` | 5.748 | Knowledge graph | 0.70–2.40 | 1 |
| `midnite-light-councils.mov` | 4.833 | AI Councils | 1.20–2.90 | 1 |
| `midnite-light-workflows.mov` | 7.067 | Workflows | 3.20–4.90 | 1 |
| `midnite-dark-skills.mov` | 6.920 | Embedded skills | 1.60–6.70 | 1 |
| `midnite-loops.mov` | 10.807 | Convenient loops | 3.00–9.80 | 1 |
| `midnite-dark-workflows.mov` | 7.745 | Custom graphs | 2.33–7.47 | 1 |
| `midnite-ai-companion.mov` | 4.49 | Companion | 0.40–4.38 | **0.78** |

Three rates and one repeat need their reasons written down:

- **Watch your swarm, 0.40×.** A 4fps contact sheet puts the commit graph on
  screen from 2.75s to 3.65s and nowhere else in the take — 0.9s, of which the
  first quarter-second is the pane still sliding in. The claim needs 1.70s. At 1×
  from 2.93s the shot played straight past it: a still at frame 700 was a
  *terminal* under a caption reading "Watch your swarm". What makes 0.40×
  survivable is that a finished commit graph does not move, so the rate has
  nothing to be visible in.
- **Manage your forge, from 4.47s at 0.88×.** The earlier window (3.90s, 1×)
  caught the tail of the project board and then the view switch into the runs
  pane, which on this recording is three frames of a completely black window.
  4.30s looked settled on a 10fps sheet and was not — the pane deals its rows in
  over the two frames after it, which a still at the cut showed as an empty
  shell. 4.47s is past all of it, and 0.88× is what makes 1.70s of picture fit in
  the 1.58s of clip left after it.
- **Companion, 0.78×.** The shortest clip in the set against a three-bar
  movement. Not a choice — the fastest the shot can run without freezing on its
  last frame.
- **The workflow graph builder appears twice**, as stage 3's "Workflows"
  (`light-`) and stage 4's "Custom graphs" (`dark-`). Different recordings,
  different theme, twenty-five seconds apart, and those are the product's own two
  names for one surface — stage 4's own copy for "Custom graphs" reads
  *accomplish real workflows*. It is the one repeat in the cut that is a judgement
  call rather than an observation, and it is the first thing to undo if a
  dedicated `custom-graphs` recording lands.

`clips.ts` throws at module scope if `trimBefore + frames × rate` overruns a
clip's `seconds`, because this is the one failure that is silent: ask for more
source than exists and `OffthreadVideo` holds the last frame, which on a screen
recording is indistinguishable from the app having hung.

`midnite-video-knowledge-graph.mov` is cropped `{ top: 100, right: 166 }` — the
pilot's crop, for the pilot's reason (a "this graph is 17 commits behind HEAD"
banner that is true of the recording machine and says nothing about the product)
and with its arithmetic (the 166 off the right makes the kept box 2746×1658,
which is the card's aspect to within a thousandth).

### Still to be recorded

Three beats have no footage. Each renders a designed title card (`AppShot`'s
pending state) rather than a hole, so the cut is watchable today — **5.1 seconds
of the 88**, down from 15.3 in the first cut.

| drop into `assets/video/app/` | beat | span |
|---|---|---|
| `midnite-kanban.mov` | Agentic kanban | f719–770 (1.7s) |
| `midnite-multi-screen.mov` | Multi-screen | f1076–1127 (1.7s) |
| `midnite-video-editor.mov` | Video Editor | f1230–1281 (1.7s) |

All three sit on the **light** stage, so record them with the app in its light
theme — that is what the `light-`/`dark-` pairs delivered in round two are for,
and it is why AI Councils and Workflows could be dropped straight in.

Record a couple of seconds longer than the span so there is a window to choose.
Then, per clip:

1. `ffprobe -v error -show_entries format=duration <clip>` → the container
   duration.
2. `ffmpeg -i <clip> -vf "fps=4,scale=470:-1,tile=5x4" -frames:v 1 sheet.png`
   → pick the window, checking the frame the shot *opens* on, not only that the
   span contains the good part. **4fps, not 2** — a 2fps sheet is what said the
   commit graph ran from 3s to 4.5s, and it does not.
3. In `clips.ts`, swap the `pending(…)` call for `shot(clip, seconds, trimBefore,
   rate, frames)` with the same `frames` expression. The module-scope fit check
   arms itself for that shot the moment you do, which is the point of pasting a
   real `seconds`.

Nothing else changes. `AppShot` picks the branch off `clip === null`.

---

## 4. The timeline, frame by frame

Every frame below is `bar(n)` from `beats.ts`. Nothing in the composition
contains a number that is not imported from there.

### Stage 1 · Intro — f0–463 (0.00–15.44s), **black**

Opens on the crescent alone, 150px, centred at (960, 462) — `MARK.open` — with
its ramp glow breathing on pure black. That is the film's first frame and its
last; see §5.

At f18–46 the prompt **unfurls out of the mark**: a clip whose width animates,
with the gap to the mark as a margin *inside* it so the whole thing collapses to
nothing. The same idiom as the wordmark's name, which is the point — everything
in this film comes out of the mark the same way.

The row is `[mark] [>_] [text][caret]`, centred **as a row**, in white JetBrains
Mono at 56px. The prompt is a chevron and an underline with no box around it; the
caret is a thin ramp-filled rule rather than a block glyph.

| # | line | bar | frame | cpf | note |
|---|---|---|---|---|---|
| — | the mark alone | −9 | 0 | — | 18f |
| — | the prompt unfurls, caret blinking | — | 18–46 | — | |
| 1 | `AI, Agents, Swarms, Loops, Graphs...` | −7 | 106 | 1.2 | |
| 2 | `AGI... Superintelligence...` | −5 | 208 | 1.2 | the intro's strongest onset |
| 3 | `Singularity...` | −3.6 | 279 | 1.2 | 26 frames of empty line after it |
| 4 | `...` | −2.4 | 341 | 0.3 | a dot every three frames |
| 5 | `Harness the beast` | −1.8 | 371 | 0.62 | erased from f412 |
| — | the prompt folds back into the mark | −0.8…−0.2 | 422–453 | — | |
| — | the mark alone | — | 453–463 | — | 10f before the hit |

Five lines, not eleven. The first cut had a word a line accelerating into a
shrug; the shape was right and it spent nine bars getting there. These say the
same thing in three sentences and give the last two bars of the act to the thing
the act is for, which is the mark sitting alone on black waiting to be hit.

`...` at 0.3 chars/frame is the brief's short pause made visible rather than
described, and `Harness the beast` at 0.62 is the line being *said*. Erases are
computed backwards from the next line's beat (`Intro.tsx`'s `eraseAt`) so moving
a beat moves the erase before it; line 5 carries its own, because what follows it
is not another line.

**Shimmer**: three white `SmokeStreak`s at 0.12 intensity, on lines 1, 3 and 5.
White, not the ramp — this act's only colour is the logo's own glow, and a violet
streak would be the second. Low, because a band crossing a small mark on pure
black has nothing to rake across and reads as a smear on the lens if you let it.

**Keyboard**: one strike per character, capped at one per frame. 85 strikes.

### Stage 2 · Product — f463–974 (15.44–32.47s), **light**

| beat | bar | frame | stage | content |
|---|---|---|---|---|
| wipe + lockup | 0 | 463 | **→ light** | the name unfurls out of the mark, "Studio" types |
| Launch any agent | 1 | 514 | light | eleven marks dealt in one position, accelerating |
| ″ (video) | 2 | 565 | light | the picker, with the eleven cascading along the card's foot, each lighting in its own colour |
| Manage multiple git repos | 3 | 617 | light | repos sidebar |
| Watch your swarm | 4 | 668 | **← dark** | commit graph |
| Agentic kanban | 5 | 719 | dark | **title card** |
| Manage your forge | 6 | 770 | dark | workflow runs |
| Dockable browser | 7 | 821 | dark | terminal + docked browser |
| System monitor | 8 | 872 | **→ light** | memory gauges — the music's own section change |
| Knowledge graph | 9 | 923 | light | the graph |
| — | 10 | 974 | | stage 3 |

Eight claims and a logo reveal in seventeen seconds is a **montage, not a tour**:
1.70s per claim, so every one has to be a single readable image. That is why each
title is four words or fewer and each shot is one screen.

The stage turns over twice inside the act — dark for the four middle claims,
white again for the last two, on the frame the music changes section. Both are
bar lines with a measured onset under them; see `wipes.ts`, which is the only
place that decides this.

The three git claims run together — repos, swarm, kanban — because they are one
argument made three ways, and a viewer who has just been shown a sidebar of
repositories reads the commit graph after it as *those* repositories.

> **The kanban claim cost a bar, and the bar came out of the build-up.** There
> was nowhere else to take one from that did not cost more, so stage 3 now starts
> at bar 10 rather than bar 9 and the music's section change at bar 8 lands on a
> claim cut instead of on a stage boundary. That is the one place in the cut
> where the picture and the arrangement are not saying the same thing.

**The deal.** Eleven marks in one position over one bar, each held for 0.88× the
time of the one before — a geometric decay, because "increasing the speed as you
go" describes a *rate* increasing. 0.88 rather than 0.85 so the last mark still
gets 2.25 frames; at 0.85 the final three are under two frames, which at 30fps is
not fast, it is invisible. A three-frame linear pop, not a spring — a spring's
settle is longer than the gap by the end of the deal. Drawn `tone="ink"`, because
this beat is on white paper: see §3 on Grok.

**The cascade.** The brief asks for three things here (deal, row, video) in two
bars. The row and the video are combined: the eleven marks cascade along the
bottom of the card, on a dark scrim, while the picker lists eight agents above
them. One image making the point once.

A band of light crosses each mark as it arrives, clipped to the glyph by a mask
of its own SVG and tinted with **that agent's accent**. Eleven marks flashing the
same violet would be eleven marks flashing violet; eleven each flashing their own
brand is a roster, which is the claim the beat is making. The accents come from
`shared/agentAccents.ts`, which `make-logo-cuts.mjs` generates from the same
table it cuts the `-color` files with.

**Captions** are typed at 2.2 chars/frame with `delay: 3` — three frames is the
caption row's own entrance, so the first character lands the moment it settles.

### Stage 3 · Build-up — f974–1383 (32.47–46.09s), **dark, then light**

| beat | bar | frame | span | stage |
|---|---|---|---|---|
| R→L wipe; "Replace no one" | 10 | 974 | 1 bar | **dark** |
| L→R wipe; "Empower everyone!" | 11 | 1025 | 1 bar | **light** |
| Multi-screen | 12 | 1076 | 1 bar | light — title card |
| AI Councils | 13 | 1127 | 1 bar | light |
| Workflows | 14 | 1178 | 1 bar | light |
| Video Editor | 15 | 1230 | 1 bar | light — title card |
| strip-back | 16 | 1281 | 2 bars | light |

**One sentence across a change of stage.** "Replace no one" is said in the dark
and "Empower everyone!" in the light, a bar apart, with a liquid wipe under each.
It is the tightest pair of stage changes in the film — two inside two bars — and
it is the pattern the rest of the cut copied when the brief asked for more of
them.

Then four features, a bar each, on the light stage — the last three on the
track's own rising figure (measured onsets at bars 13, 14 and 15). There is a
fourth accent at bar 15.5 and the cut deliberately does **not** use it: four
names on four accents leaves one bar before the drop instead of two, and two is
what the strip-back needs.

Nothing is drawn in bars 16–18. The track's accents stop at 16.1 and it is
near-silent from 44.4s; `Backdrop` is already fading the bloom and the motes out
across that span, so what the drop lands on is close to bare white paper.
Filling that gap is the most common way to waste a drop.

Both statement lines are `ShimmerLine` at 104px. Their readable layer is coloured
from `themeMixAt` rather than from their own theme — each lands on the frame its
own wipe *starts*, so for the first few frames it is standing on the stage it is
leaving, and painted for the stage it is arriving on it is invisible. See §5.

### Stage 4 · Harness — f1383–2047 (46.09–68.23s), **dark**

Layout changes here, and that is the point: stages 2–3 are claims *about*
pictures, so the picture is centred with the caption over it; this act is a list,
so the type takes a 560px column at the left margin and the recording moves to a
1060×640 panel beside it. Both share the caption line, which is what lets the
lockup slide horizontally between the layouts instead of flying.

| movement | bar | frame | stage | items (bar / frame) |
|---|---|---|---|---|
| Embedded skills | 18 | 1383 | **← dark** | Developing 19/1434 · Reviewing 19.75/1472 · Brainstorming! 20.5/1510 |
| Convenient loops | 21 | 1536 | dark | six flashes 21.5–23.375 (f1562–1657) · "Configure behaviour with a UI" 23.75/1676 · "Custom override" 24.4/1710 |
| Custom graphs | 25 | 1740 | **→ light** | Custom agent swarms 26/1791 · Accomplish real workflows 26.75/1830 · Automate anything 27.5/1868 |
| Companion | 28 | 1894 | **← dark** | Customize personality 29/1945 · MCP for true assistance 29.67/1979 · Voice comms, like J.A.R.V.I.S 30.33/2013 |

Two of the four movements flip the stage, which is the brief's "use more of the
light and dark transition here". **The loops movement deliberately does not**: its
six flashes are Tailwind 500 swatches and cyan-500 on 99%-lightness paper is
2.6:1. The colour is the point of that beat and the light stage takes it away.

Headings land on bar lines that have a measured onset under them (18, 21, 25,
28); items sit on the thirds and halves the drop's eighth-note figure supports.

**Everything is typed** — four headings at 1.5 chars/frame and twelve items at
1.8. The first cut typed only the headings, on the argument that sixteen typed
lines under a drop would rattle; the brief asked for the items too, and that is
the better call for a reason the first version missed: a list that *appears*
reads as a slide, a list being typed reads as the harness being configured while
you watch. What keeps it from rattling is the level, not the count — items are
at 0.72× the headings' volume, and `TypingSound` caps the clicks at one a frame,
so twelve items add about four seconds of keyboard spread across twenty-two.

**The bullet is a round dot in the type's own ink.** It was a 34×3 rule in a ramp
colour, which is a dash — and a dash at the head of a line is punctuation, so
twelve of them read as twelve sentences with their first word missing.

The column's ink comes from `themeMixAt`, not from a constant. The drop's wipe
travels right-to-left and reaches this column eight frames in, so the heading's
first two characters are typed while the stage under them is still white.

**The loop flashes** are six names, 19 frames each (⅜ bar), in the product's own
colours — `text-green-500 / cyan-500 / blue-500 / violet-500 / red-500 /
orange-500` from midnite-studio `packages/shared/src/loops.ts`, so a colour in
this video is a colour in the app. They replace the item list for that stretch,
then the two configuration lines land where they were.

### Stage 5 · Outro — f2047–2640 (68.23–88.00s), **dark → black**

| beat | bar | frame |
|---|---|---|
| "Connect with" | 31 | 2047 |
| GitHub | 32 | 2098 |
| GitLab | 33 | 2149 |
| Bitbucket | 34 | 2200 |
| Azure DevOps | 35 | 2251 |
| the four as a row + "Start for free" | 36 | 2302 |
| shimmer cascade across the row | 36.125 … 36.875 | 2309 · 2321 · 2334 · 2347 |
| the lockup, centred, "Studio" typed again | 38 | 2404 |
| "Studio" unpicked; the name folds into the mark | 39.5 | 2481 |
| the stage goes to true black | — | 2481–2521 |
| "Coming Soon" | 40.5 | 2532 |
| "Coming Soon" fades | 41.5 | 2583–2617 |
| **the mark, alone, on black** | — | 2617–2639 |

"Connect with" gets the breakdown's silence to itself and the first forge arrives
on the frame the music does — the one moment in the film where the picture waits
for the track rather than the other way round. The row and the call to action
land on bar 36, the loudest onset in the piece. The lockup lands on the last
boom, as the brief asked.

The forges are drawn big one at a time (150px mark + 92px name) and small as a
row (104px). Those are two different statements: *this one*, which has to be
recognisable in 1.7s, and *all of them*, where the count is what matters.
`tone="white"` on both, which changes GitHub alone.

**The cascade** is a band of light crossing each mark in turn, thirteen frames
each, on the **eighths of bar 36** — the treble between the kicks, which is what
the brief asked for. Counted on the grid rather than fitted to the onset list,
deliberately: the off-beat content there is hi-hat, which a 40ms onset envelope
registers as a smear rather than as four events, and the kick on the quarters
proves where the eighths are.

The band is clipped to the mark by a CSS mask of the same SVG, so what lights up
is the octocat rather than a rectangle passing over it — **and** each mark blooms
as the band crosses its middle. The bloom is not decoration: GitHub's mark is
drawn flat white here, and a white band clipped to white ink does nothing at all.

**The close is the open, run backwards.** "Studio" is unpicked a character at a
time at the same speed it was typed (not `Typewriter`'s 2.2× backspace — this is
the lockup being taken apart deliberately, not a line being corrected), then the
name folds into the mark, then everything under the mark goes to true black, then
"Coming Soon" comes and goes. The last twenty-two frames are the crescent alone
on black: frame 2639 against frame 0 measures **PSNR 54dB**, which is the same
picture.

---

## 5. Things that run the length of the film

**`wipes.ts`** — the four changes of stage, in one list, shared by `Backdrop`
(which draws them) and everything standing on top of them (which has to change
colour as they pass).

| # | at | bar | length | direction | brings in | under |
|---|---|---|---|---|---|---|
| 1 | 463 | 0 | 46 | → | the product's light theme | the lockup |
| 2 | 668 | 4 | 26 | ← | near-black | "Watch your swarm" |
| 3 | 872 | 8 | 26 | → | light | "System monitor" — the music's section change |
| 4 | 974 | 10 | 26 | ← | near-black | "Replace no one" |
| 5 | 1025 | 11 | 26 | → | light | "Empower everyone!" |
| 6 | 1383 | 18 | 26 | ← | near-black | the drop |
| 7 | 1740 | 25 | 26 | → | light | "Custom graphs" |
| 8 | 1894 | 28 | 26 | ← | near-black, for good | "Companion" |

Eight, where the first cut had three and all of them at act boundaries. The brief
asked for the transition to be used more, so stages 2 and 4 now turn over inside
themselves as well — but **where** is not free choice: every flip is a bar line
with a measured onset under it, and number 3 is the track's own section change.

Directions alternate all the way down, so a run of wipes never reads as one
object crossing the film again and again, and each theme is arrived at from both
sides, which the brief asked for in as many words. The first is a little under a
bar, long enough to be watched; the rest are half that, because several of them
are a bar apart and the one on the drop lands on the biggest hit in the track,
where a long dissolve would be the picture arriving a bar late.

Two places deliberately do not flip. The **loops movement** stays dark because its
six flashes are Tailwind 500s and cyan-500 on 99%-lightness paper is 2.6:1 — the
colour is the point of that beat. And the **outro** stays dark from bar 28,
because the last thing this film does is land on black.

**`Backdrop`** — five surfaces, four `LiquidWipe`s, one component. A background
per scene would unmount each at the boundary, which is exactly where a transition
has to be mid-flight. They stack: a wipe covers the frame completely at
`progress: 1` and keeps covering it, so the sequence of surfaces is the stack read
bottom to top, and the build-up's bloom can simply be drawn between two of them
rather than faded out by hand.

**`TravellingMark`** — one `MidniteWordmark`, on screen from the first frame to
the last, across **five** stations:

| station | size | where | from |
|---|---|---|---|
| open | 168 | centred, y 462 | f0 |
| caption | 50 | the caption line, x 287 | bar 1 |
| column | 50 | the list layout's margin, x 145 | bar 18 |
| connect | 180 | centred, y 250 — over "Connect with" | bar 31 |
| close | 168 | `open` again, exactly | bar 38 |

The name folds back into the mark on the way out and unfurls again on the way
back, which is `reveal` run backwards. `connect` is the outro's own and the only
station where the mark stands *above* something rather than beside it: from bar 31
to the end of the film the logo is the subject again, and the rest of that act —
the eyebrow, the forge row, the call to action — is laid out downwards from it
(`OUTRO_*` in `layout.ts`).

`MARK.close` **is** `MARK.open`, the same object rather than two sets of numbers
that agree today. It used to be 160px at y=494 — six pixels bigger and thirty-two
lower than the opening station, which on a loop is a visible jump on the cut and
looks like a dropped frame.

The intro draws its own copy, because the row it is centred in belongs to that
act. The handoff at bar 0 is exact rather than approximate: by then the prompt
has folded away, so the intro's row *is* the mark, centred — which is `MARK.open`.

### The theme crossfade is computed, not timed

The mark is on screen through all four wipes and has to change colour under each.
A white crescent on 99%-lightness paper is not subtly wrong, it is a blank space
where the logo should be. Two stacked copies crossfaded, not interpolated
colours: the crescent is an `<Img>` of a flat-filled SVG and a file cannot be
tweened.

**What drives the crossfade is `wipeCoverage`** — the wipe's own geometry, asked
how much of the incoming stage has reached the column the mark is standing in on
this frame. `themeMixAt` applies each wipe's answer on top of the last, in order.

That replaced four hand-written interpolations and the replacement is not
tidiness. The right frame depends on the wipe's length, its easing, its direction
**and** where the object is standing — four facts, none of which lives near the
number being written — and two of the four hand-timed ones were wrong in the
first render: a white crescent on white paper for a quarter of a second at one
wipe, an ink one on near-black for six tenths at another. Neither shows up in a
thumbnail.

The same function now colours the harness column and the build-up's two statement
lines, which had the identical bug for the identical reason.

> Where the mark actually is, is not `960 + dx`. The lockup is centred as a pair,
> so while the name is out the crescent sits left of the middle by half the
> name's width — `NAME_WIDTH = 4.29 × size`, measured with `bbox.py` over a
> rendered still.

### The mark is a sub-woofer with a spectrum ring

`aura` is a conic sweep of the theme's ramp behind the crescent, blurred past its
edge, breathing on two slow incommensurable sines. Conic rather than linear
because a linear ramp behind a round mark has a light side and a dark side and
reads as a lit object; a conic one has the whole ramp at every radius and reads
as the mark *emitting*.

**`MarkWaveform`** stands 72 spokes off the crescent's edge inside that glow, each
as long as one band of `BANDS` is loud on this frame, with sixteen motes riding
them. The bands are mapped out from twelve o'clock and mirrored back, so bass is
at the top and the left half is the right half reflected — wrapping them once
around instead puts the loudest band next to the quietest at the seam, and a ring
with a notch in it reads as broken rather than as asymmetric.

**The cone is driven harder than it was, and not cleanly.** `thump` scales the
crescent by up to 14% (it was 7%; past about 16% it starts colliding with the
name beside it), and on top of that `punch` flexes it — `sx` and `sy` pushed in
opposite directions by the same jitter — rocks it a couple of degrees and throws
it a few pixels in both axes. All four come from `hash(frame + k)` at different
offsets, so they are uncorrelated with each other and with the beat, which is the
difference between "chaotic" and "shaking in time"; the latter reads as the whole
frame being unstable rather than as the logo being hit.

Everything is a *fraction* of `size`, which is what makes one component right at
both ends of the film: at the 50px caption station the whole effect is under a
pixel, where a logo pumping on every kick would be a tic. `aura` is interpolated
from the same size, so the glow — and with it the ring, which is gated on it —
is proportional to whether the mark is the subject.

The one place that is not size alone is `connect`: the cone is driven half again
as hard there, because that beat is the only one in the film where the logo is
alone on the stage *with the music underneath it*. The intro has no bass to speak
of and the close is a wind-down. It comes back off as the mark flies home, so the
close is the open's twin.

`auraLoop` is what keeps the loop honest: given the film's length, each idle
period is nudged to the nearest one that divides it a whole number of times and
the ramp to the nearest whole number of turns. The shifts are under one percent —
71 frames becomes 71.35 — and without them the last frame caught the breath near
its peak while frame 0 had it at its trough.

### The cards are struck onto the stage

Every shot — real or placeholder — arrives the same way: **70% to 100% over seven
frames**, eased out hard, sliding a twentieth of its own size from one edge, with
a shake on top. Seven frames is a quarter of a second and under a seventh of the
shortest beat it is used on, which is what the brief's "rapidly" asks for: the
picture is being *hit* onto the stage by the bass, so it has to be over before the
ear has finished the transient.

The shake is `punch`, not `thump`, decayed over fourteen frames. Driven from the
cone's displacement the card would tremble for its whole shot; driven from the
strike it is struck and then holds still, and the decay means even a run of hits
cannot keep it moving past its first beat.

The tour's cards cycle through the four edges, because its window is centred and
no direction fits it better than another — four cuts all rising from the bottom
read as one object being replaced rather than as four claims. The harness panels
always come **from the right**, because they sit against the right margin and
arriving from the edge they are nearest is the one direction that reads as the
card sliding into the layout rather than across it.

Behind each one, `Halo` turns a blurred conic sweep of the theme's ramp at the
card's own corner radius, standing 26px proud of it and breathing on `thump`.
It is drawn under the card rather than set as a `box-shadow` because **CSS gives
a shadow one colour** and this one has to rotate.

### Shimmer

Every structural cut gets a `SmokeStreak` — the same `feTurbulence` →
`feDisplacementMap` pair `LiquidWipe` uses, on a raking band rather than on a
panel. The film's transitions are liquid, and punctuating the cuts *inside* an
act with a clean airbrushed flare was two visual languages sharing a reel.
Directions alternate throughout; ids and seeds come from the frame each lands on,
because `url(#id)` is document-global. A streak that happens to land on a wipe is
raised to a stage-change's strength rather than a cut's, read off `WIPES` so the
two lists cannot drift.

Three other things shimmer, each for a reason the others would not serve:

- **the agent roster**, in each mark's own accent, masked to the glyph — see §4.
- **the forge row**, one mark at a time on the eighths of bar 36, a white band
  plus a bloom around the whole mark. The bloom is not decoration: GitHub's mark
  is drawn flat white here and a white band clipped to white ink does nothing.
- **the forge names**, with `ShimmerLine`'s `band="brand"` — the ramp across the
  letterforms' *stroke* rather than a white highlight over them. The mark beside
  each name is a vendor's colour, so the type is the only midnite-coloured thing
  in the frame, and making it carry the ramp rather than reflect a white light is
  what keeps the beat reading as midnite connecting to them rather than as a logo
  parade.

`SwooshStreak` is still in `shared/` and is still the right thing when a cheap
clean highlight is wanted. Nothing in this film uses it any more.

### The sound

All of it at the top level. One-shots are positioned by the beat they *land* on
and `SfxSound` works backwards through each file's measured swell (the riser's is
seven seconds); mounting one inside its scene would clip exactly the part that
builds to the cut. The riser's head is trimmed to `STAGE.harness − BUILD.breath`
— the two bars the track actually spends emptying.

~230 audio mounts in total, of which ~215 are keystrokes.

### Render cost

**≈6 minutes for the full 2640 frames**, up from 4.5 in the first cut — the
difference is the ~25 `SmokeStreak`s, which are the same per-pixel Perlin
evaluation a wipe runs. They are affordable because of the *mount*: a streak
exists only inside its own short `<Sequence>`, where a wipe is mounted for the
whole film.

The first cut was heading for 40+ minutes until a bug in `LiquidWipe` was found:
the wipes stay mounted by design, and each was running `feTurbulence` plus two
`feDisplacementMap`s over a 2.1-megapixel stage every frame, redrawing a picture
that stopped changing the moment the wipe landed. Both ends now short-circuit —
nothing at `progress ≤ 0`, a flat fill at `progress ≥ 1` — and both are
output-identical rather than approximations (MSE 0.00 / PSNR 81.5dB at f900).

The diagnosis is the reusable part. Remotion copies each source clip into
`$TMPDIR/remotion-*-assets*/remotion-assets-dir` the first time a frame needs it,
so `ls -lt` on that directory is a free progress bar: each `.mov`'s timestamp is
the wall-clock moment the render reached the frame that clip first appears on.
That is what showed the render crawling through a stretch with no video in it at
all, which ruled the footage out in one reading.

---

## 6. New shared components

Everything a second video would want is in `src/shared/`:

| component | what |
|---|---|
| `LiquidWipe` | the horizontal smoke transition — `feTurbulence` → `feDisplacementMap`, in pixels |
| `LiquidWipe.wipeCoverage` | **how much of the incoming stage has reached a given column** — what anything standing on a wipe colours itself from |
| `SmokeStreak` | the same treatment on a raking band: the shimmer, for a film whose transitions are liquid |
| `TypedTitle` | a page title, typed, with the ramp glowing off it — two `Typewriter`s sharing one box |
| `MarkWaveform` | the spectrum ring and its motes, drawn from `BANDS` |
| `Particles` | a few drifting motes, closed-form in the frame, golden-ratio placement |
| `ForgeLogo` | the four forge marks, a per-mark optical `TRIM`, and a mask-clipped `shimmer` |
| `AgentLogo` `shimmer` | a band of light across a mark, masked to the glyph, in that agent's accent |
| `AgentLogo` `tone="ink"` | the roster on the light stage — Grok's accent is white |
| `agentAccents.ts` | **generated** by `make-logo-cuts.mjs`: the accents themselves, for anything that has to paint with one |
| `TypingSound` (in `Sfx`) | the keyboard, scheduled from a `TypewriterTiming` |
| `Typewriter` `caret` | `"bar"` (a thin ramp-filled rule, the cap height in either face), `"none"`, or the old block glyph — plus a strut that fixes the alignment on an empty line |
| `Typewriter` erase | `eraseAt` / `eraseCharsPerFrame`, plus `typedCount` and `keystrokeFrames` |
| `ShimmerLine` `theme` / `band` | the ramp re-cut for the light stage, and a brand-coloured travelling band |
| `MidniteWordmark` `theme` | the lockup on either surface |
| `MidniteWordmark` `aura` / `thump` / `punch` / `bands` / `auraLoop` | the glow, the woofer, the ring, and the loop |
| `brand.LIGHT` / `THEME` / `themeRainbowStops` | the product's light theme |

Gotchas worth not rediscovering:

- **`LiquidWipe` must be written in pixels.** The first version used percentages
  and never finished its wipe: `translateX` resolves a percentage against the
  *element's own* width, the mask's stops resolve against it too, and the frame's
  width is a third quantity — so the panel arrived with its smoke band still over
  the last sixth of the screen.
- **The landed panel has to overshoot the frame by the displacement scale.** With
  its opaque region ending exactly at the frame's edge, the displacement map
  dragged transparency back inside it, and that rendered as pale smears down the
  right-hand side of the *finished* wipe for the rest of the act.
- **In `SmokeStreak` the blur comes before the displacement**, because the filter
  takes the element's rendered output as `SourceGraphic`. Displacing a soft edge
  is smoke; blurring a displaced hard edge is a smudge.
- **An out-of-flow caret needs something in the line to measure against.** CSS
  treats a line box with no text and no inline carrying margins, padding or
  borders as zero-height, so on the frames where nothing was typed the caret
  dropped by half the face. `Typewriter` now carries a zero-advance inline-block
  holding a space.
- **`line-height` centres the font's content box, not its cap box.** How far
  apart those two are is a property of the face, and Poppins' are lopsided
  enough that a title centred in its own line box sat **8.5px below** a mark
  centred in the same one — measured identically on a light still and a dark one,
  which is what said it was the layout and not the content. `CaptionLine` carries
  the correction and the measurement that produced it; re-measure it if the face,
  the size or the line changes.
- **A caret has to be the cap height of the face beside it.** Before that was
  worked out, the bar ran a quarter taller than the capitals and hung six pixels
  below the baseline at title size. The anchor and the two `em` numbers in
  `Typewriter` now put it 0.73em above the baseline and 0.04em below, which is
  within three hundredths of the cap height of *both* faces this repo sets.

---

## 7. Open items

1. ~~**"Ideate" vs "Concepts".**~~ **Closed in v5 — it is Concepts.** The brief
   named the cyan loop *Ideate* and the product called it *Concepts* (preset id
   `innovate`), with the tab bar in `midnite-loops.mov` saying so on screen at
   4.2s. The client's fifth round writes it `/concepts` and confirmed on being
   asked that this is the `innovate` loop.

   It is no longer one string anywhere: `scripts/make-loop-icons.mjs` reads the
   name, the glyph and the colour out of the app, so the film cannot disagree
   with the product about this again.
2. **Three recordings outstanding** — §3. Until they land, 5.1s of the 88 are
   title cards.
3. **Runtime is 88.0s.** Every stage boundary is within 1.4s of the brief's own
   timings except the build-up, which is 2.5s late because the kanban claim took
   a bar. Shortening the film means dropping a beat, not compressing them.
4. **The graph builder is shown twice**, as "Workflows" and as "Custom graphs" —
   §3. The judgement call in the cut.
5. **`terminal-git-graph-repos` is used twice**, for the repos sidebar and for the
   commit graph. Two different screens recorded in one take, so it is not the same
   shot twice — but if a viewer is going to notice anything, it is this.
6. **The recordings carry a recorder watermark** (the midnite crescent in a white
   disc, bottom right of every clip). It is midnite's own mark and the pilot ships
   with it, so it has been left. Say if it should be cropped.
7. **"Dockable Browser" and "System Monitor" are set sentence-case** in the cut
   ("Dockable browser", "System monitor") to match the other claims. The brief
   title-cased them; flag if that was deliberate.
8. **One v3 note is cut off mid-sentence** — "the logo should also be slightly
   larger when in ". Built as *larger wherever the logo is the subject*: the
   opening and closing station went 150 → 168px, and the outro gained a 180px one
   where the mark stands over "Connect with". If the intended ending was
   something else, the two numbers are in `layout.ts`'s `MARK`.
9. **"Replace no one" is a rename read out of a parenthetical.** The v3 note gives
   the pair as *"replace no one", "empower everyone", formerly "don't replace
   anyone", "empower everyone"*, which reads as a rename of the first half only.
   One string, in `stages/BuildUp.tsx`.
10. **Stage 4's two instructions pull against each other.** v2 asked for the dark
    theme on every slide there; v3 asked for more light/dark transitions. Two of
    the four movements now flip and the loops movement deliberately does not —
    §5, and `wipes.ts` carries the contrast measurement that decided it.

---

## 8. Checklist

- [x] Bar grid fitted to measured onsets; every cut traces to `beats.ts`
- [x] Every stage boundary on a measured onset
- [x] All thirteen shots fit their clips (module-scope check in `clips.ts`)
- [x] Knowledge-graph banner cropped, aspect preserved
- [x] Light theme transcribed from the product's own `tokens.css`
- [x] The lockup legible on both surfaces, at all eight wipes
- [x] The harness column and the build-up statements legible at their wipes
- [x] Grok legible on the light stage; the retired Aider cut removed and guarded
- [x] Titles aligned to the mark — measured +0.5px light, 0.0px dark, against
      +8.5px before `CaptionLine`'s correction
- [x] The caret one height in both faces (37px against a 35px cap), and holding
      its y through the 0 → 1 character transition
- [x] `npm run lint` (eslint + tsc) clean
- [x] `make-keyclick.mjs`, `make-logo-cuts.mjs`, `make-track-envelope.mjs` `--check` clean
- [x] Full render made — `output/v3-edits.mp4`, 88.06s
- [x] Render verified against the grid: ten of `scdet`'s eleven picture changes
      on bar lines to the frame; the eleventh is a view switch inside the browser
      recording, at the same f856 v1 and v2 found it
- [x] Loop seam verified — 50.4dB at v4, 48.1dB at v5 after the ring was made heavier
- [ ] Three recordings made and wired in (§3)
- [x] "Ideate" vs "Concepts" decided — Concepts, confirmed by the client in v5 (§7.1)
- [ ] Runtime signed off (§7.3)
- [ ] The graph-builder repeat signed off (§7.4)
- [ ] Cut watched end to end by a human, for motion rather than stills

---

## 9. Fourth round (v4)

The client's fourth round, after `output/v3-edits.mp4` — brief text in
`input/BRIEF.md`'s `# Edits (v4)`. Five asks, none of them a re-opening of
rounds v1–v3: §§1–8 above are unchanged and nothing in them was re-verified for
this round. Each of the five was checked against the code on disk as it stands
today, not against what the brief assumes it looks like, and every number below
is either read out of a file or measured off a rendered still with `bbox.py` —
none is eyeballed.

### 9.1 The mark's vertical centre

**File:** `layout.ts`. **Constant:** `OPEN` (the object both `MARK.open` and
`MARK.close` point at — same object, per §5, so this is a one-line fix that
reaches both ends of the loop and the intro's own copy in `Intro.tsx`, which
reads `MARK.open.dy` directly).

The brief: "The logo (and text, etc.) is not vertically centred when it is in
the centre. It is only slightly off, but noticeable — move the logo (and
wordmark) to be vertically centred."

**Measured**, not assumed. Rendered `MidniteGolivePromo` at f10 (the intro,
mark alone, before the prompt unfurls) and f2630 (the outro's close, mark
alone, past `ComingSoon`'s fade) — the film's only two moments this station is
ever drawn at, both on pure black — and ran `bbox.py` on the crescent at each:

```
tools/bbox.py f10.png   --region 700,300,1055,650 --th 100   # excludes the intro's own caret, further right
tools/bbox.py f2630.png --region 850,300,1100,650 --th 40
```

Both gave the same box, to the pixel: **ink x 876–1043, y 385–545** (168×161px).
That agreement is the cross-check — two different frames, two different code
paths drawing the mark (`Intro`'s own `markOnly` copy and `TravellingMark` with
`reveal` decayed to 0), same pixels.

The mark's *div* — `size: 168` square, translated by `OPEN.dy` — spans y
378–546 at the current `dy = 462 − 540 = −78`. So:

| | top | bottom | centre |
|---|---|---|---|
| box (168px square, `dy=-78`) | 378 | 546 | 462 |
| ink (measured) | 385 | 545 | **465** |

Two things are true at once, and the brief's "only slightly off" is only right
about one of them:

1. **The crescent's own artwork is not centred in its box.** 7px of empty
   padding above it, 1px below — a 6px asymmetry, half of which (3px) is why
   the ink's centre (465) sits below the box's nominal centre (462). Small, and
   it is the "asymmetry inside `MidniteWordmark`'s own box" the brief could
   have meant — but the glow/ring red herring in that phrasing doesn't apply
   here: `aura`'s mask is centred on the box exactly, and at `markOnly` there is
   no name to hang beside it and pull the box off-centre horizontally either.
   Horizontally the ink (876–1043) fills the 168px box (876–1044) almost to the
   pixel — no correction needed on that axis.
2. **The station itself puts the mark 78px above the stage's true centre**
   (540), not "a little" above it — `OPEN`'s own doc comment calls this
   deliberate ("a little above centre... both ends of the film live here"), but
   78px on a 1080-tall frame is 7% of the picture, and the client is reading it
   as wrong. This, not the 3px artwork asymmetry, is essentially the whole of
   what "not vertically centred" is measuring.

**The fix:** change `462` to **`537`** in `OPEN` —

```
const OPEN = { size: 168, dx: 0, dy: 537 - STAGE.height / 2 } as const; // dy = -3
```

537 rather than 540 (true centre) is the 3px correction from point 1 above,
applied in the direction that pulls the ink's centre — which sits 3px *below*
its box's centre — up to the stage's actual centre: box centre 537 + 3px of
low-hanging ink = ink centre 540. This is deliberately not a return to the
"optically high" placement the current code defends; the client asked for
centred, measured, and this is centred to within the artwork's own resolution.

**Consequence, checked:** `MARK.connect` and the two `OUTRO_*` constants are
independent absolute numbers (250, 482, 536, 766) — none of them derive from
`MARK.open`, so this change does not move the outro's eyebrow/forge/CTA stack.
`Intro.tsx`'s `transform: translateY(${MARK.open.dy}px)` picks the new value up
automatically; nothing else in `Intro.tsx` needs touching. The only stale
prose is `layout.ts`'s own comments calling `y=462` "a little above centre" and
`OUTRO_*`'s comment calling its own centring "the same slightly-high optical
centre `MARK.open` uses" — both now describe a station that no longer exists,
and are worth a pass when the code changes, but that is a comment, not a
number, and outside this document's scope.

**Open note:** moving the anchor from y=462 to y=537 is a 75px shift *down* on
screen, at both ends of the loop. If "slightly off" in the brief means the
client wants a small nudge rather than a full re-centre, that is a real
tension between the brief's own words and the measurement — flagged here per
the rule of saying so rather than quietly building around it. The measurement
is unambiguous about where true centre is; whether the client wants true
centre or merely *less far from* the old placement is a sign-off question, not
a technical one.

### 9.2 Remove the `>_` from the intro

**File:** `stages/Intro.tsx`. **Remove:** the `Prompt` component (its
definition, ~L214–225, and its one call site at ~L143) — a chevron path and an
underline path drawn as inline SVG, nothing else touches it.

The brief: "Remove the `>_` icon from the intro." No ambiguity to resolve here
— unlike most of this project there is exactly one `>_` in the file and it is
a small, self-contained component.

**What the row looks like today**, so the geometry change is explicit:

```
[mark] ── 34px margin ── [ >_ chevron ── 22px gap ── caret + typed text ]
        \_______________________ inside the unfurl clip _______________________/
```

The outer structure — `MidniteWordmark(markOnly)`, then a div whose `maxWidth`
is driven by `prompt` (the unfurl/fold value) — is untouched. Inside it, the
inner flex row currently holds two children (`<Prompt/>` and the
`Typewriter`) with `gap: 22` between them; after the removal it holds one
(`Typewriter`) and the `gap: 22` prop has nothing left to separate, so it comes
out with the component. `marginLeft: 34` stays — that is the gap from the
*mark* to the block, set as a margin *inside* the clip for the same reason the
wordmark's own name gap is (§5's note on `MidniteWordmark`: a margin inside an
`overflow: hidden` clip disappears with it; padding would not, because
`box-sizing: border-box` refuses to shrink a padding box below its own
padding). Removing `>_` does not touch that margin's job.

**The row becomes** `[mark] ── 34px ── [caret + typed text]`. Nothing about
"centred as a row" changes: the outer `AbsoluteFill` still centres
`[mark][block]` as a flex row, so for any given line the mark now sits closer
to true centre than it did — by roughly half of what `>_` plus its 22px gap
used to occupy, automatically, because the centring is CSS flexbox doing its
job on less content, not a number this document has to carry.

**The unfurl/fold survives untouched — this is the constraint the brief's own
words don't mention but the loop depends on.** `PROMPT_IN = [18, 46]` and
`PROMPT_OUT` (from `beats.ts`, `[bar(-0.8), bar(-0.2)] = [422, 453]`) are the
frames that make the intro's row collapse to the bare mark before bar 0 — the
whole reason the film loops (§5). Both are **left exactly as they are**. The
`prompt` value they drive is unchanged in meaning: 0 is the block collapsed to
nothing, 1 is the block at its natural width, and that value still gates the
same `maxWidth` clip — it now just has less to reveal. Before any character is
typed (frame ≤ 105, well after `prompt` reaches 1 at frame 46), the block's
only content is the empty-line `Typewriter` (`text=""`, `caret="bar"`,
`hideCursorWhenDone={false}`) — so what unfurls out of the mark from frame 18
to 46 is now the blinking caret alone, not `>_` followed by the caret.

**`PROMPT_UNFURL`, the clip's width cap during the partial unfurl, shrinks.**
It is 200px today, sized (per its own doc comment) to be "comfortably past the
widest thing it ever has to reveal" — which was the bare `>_` glyph (a 56px
square) plus the 22px gap plus the caret. With `>_` gone, the widest thing the
clip reveals during 18→46 is the caret alone: a zero-width strut plus an
absolutely-positioned 0.075em-wide rule, i.e. a handful of pixels at `TYPE=56`.
**Recommend `PROMPT_UNFURL = 48`** — one character-cell's width at this
monospace size, comfortably past the caret with headroom to spare, rather than
carrying a number sized for a glyph that no longer exists. This is a proposed
default, not a measured one (there is nothing to render-measure about a CSS
constant with no visual content behind it at this stage of planning); confirm
by eye once built. It only affects the look of the 28-frame unfurl itself, and
does not affect anything from frame 46 onward, since `overflow`/`maxWidth` are
both lifted once `prompt >= 1`.

**Nothing else moves.** `LINES`, `eraseAt`, the keyboard SFX schedule
(`TypingSound` keyed off `LINES`), and the three intro `SmokeStreak`s (on
`LINES[0]`, `LINES[2]`, `LINES[4]`'s start frames) are all untouched — none of
them reference `Prompt` or its geometry.

### 9.3 The mark beside "Replace no one" / "Empower everyone!"

**Files:** `layout.ts` (new station), `Promo.tsx`'s `TravellingMark` (two new
journeys in the `at()` chain). `stages/BuildUp.tsx`'s `Statement` component is
**not** touched — the brief's own text points at it only to say where the type
comes from, and the fix below is additive.

The brief: "When the 'Replace no one' / 'Empower everyone!' text comes, the
logo should move down to be on the left of either piece of text."

**Measured** — both lines are `ShimmerLine` at `fontSize: 104, fontWeight: 600`,
drawn centred on the full stage. Rendered f989 ("Replace no one", 15 frames
into its bar, dark stage, fully arrived — `arrive` interpolation finishes at
frame 12) and f1040 ("Empower everyone!", same offset into its own bar, light
stage), and ran `bbox.py` on the body layer only (high threshold, to exclude
`ShimmerLine`'s blurred ramp-glow layer underneath it):

```
tools/bbox.py f989.png  --region 200,400,1720,700 --th 220        # dark: white ink on black
tools/bbox.py f1040.png --region 200,400,1720,700 --dark --th 40  # light: near-black ink on white
```

| line | ink x | width | ink y | centre x |
|---|---|---|---|---|
| "Replace no one" | 554–1367 | **813px** | 499–602 | 960.5 |
| "Empower everyone!" | 433–1483 | **1050px** | 502–602 | 958 |

Both confirm what the code says: each line is independently centred on the
stage (both ≈960), and both sit at the same height (ink vertical centre ≈550,
consistent across the theme change).

**The station.** One fixed `(size, dx, dy)` has to sit clear of the wider of
the two lines — "Empower everyone!", left edge 433 — because the mark cannot
know which line is showing; if it were sized to hug the narrower line instead,
it would overlap the wider one by ~80px. So:

```
statement: { size: 124, dx: -621, dy: 10 },
```

- **`size: 124`** — the statement's own line height (`104 × 1.2` lineHeight =
  124.8), so the mark's box is exactly as tall as the line beside it, the same
  reasoning `CaptionLine`'s `CAP_SHIFT` note uses for matching a mark to a
  line's metrics rather than to its font-size number.
- **`dx: -621`** — mark centre at stage-x 339, right edge at 401, leaving a
  32px gap to "Empower everyone!"'s measured left edge (433). 32px is close to
  `CAPTION_GAP` (22) scaled up for the bigger mark, and is a proposed default,
  not a measured one — there's nothing to measure until the station exists.
- **`dy: 10`** — mark centre at stage-y 550, matching both lines' measured ink
  centre.

**The tradeoff, stated rather than hidden:** against "Replace no one" (left
edge 554), the same fixed mark leaves a **153px gap** (554 − 401), not 32px.
That reads as generous breathing room rather than as a second, unrelated
object — for comparison, `Intro.tsx`'s note on why "mark fixed, text centred"
failed cites "600px of nothing" as the failure mode, and 153px is a quarter of
that — but it is a real, measurable asymmetry between the two halves of one
sentence, and it is the single biggest open call in this edit. **If it reads
as loose in the finished cut**, the fix is not a second station (the brief's
"either piece of text" and "both statements must work with one station" rule
that out) but changing `Statement`'s own horizontal layout from
stage-centred to a fixed left anchor shared by both lines — the same idiom
`CaptionLine` already uses for the tour's captions (`paddingLeft:
CAPTION_MARK + CAPTION_GAP`, both mark and text hung off one shared line
rather than each centred independently). That is a larger change than this
round asks for and is noted here for the record, not specified further.

**The journeys.** The mark is at `MARK.caption` throughout stage 3 today (the
`across` journey that moves it to `MARK.column` doesn't fire until
`STAGE.harness`), so "comes down from the caption station" is literal — insert
two new legs into `TravellingMark`'s `at()` chain, in the same style as the
existing four and using the same `FLY = 18` constant:

```
toStatement   frame [BUILD.replaceNoOne, BUILD.replaceNoOne + FLY] = [974, 992]   0→1
fromStatement frame [BUILD.items[0],    BUILD.items[0] + FLY]      = [1076, 1094] 0→1
```

Chain order (chronological, each layered on the last exactly as `up` →
`across` → `toConnect` → `down` are today):

```
lerp(lerp(lerp(lerp(MARK.open, MARK.caption, up), MARK.statement, toStatement), MARK.caption, fromStatement), MARK.column, across)
```

`toStatement` starts exactly on `BUILD.replaceNoOne` (974) and lands 18 frames
later (992), 18 frames into the two-bar, 102-frame statement span — the mark is
in place for the back seven-eighths of "Replace no one" and the whole of
"Empower everyone!". `fromStatement` starts exactly on `BUILD.items[0]` (1076,
"Multi-screen"'s own cut) and completes at 1094, matching the lag every other
journey in this chain already has (`up` and `across` both start on their beat
and arrive `FLY` frames into the *next* one) — deliberately not a new,
`arrive-before-the-beat` convention. `reveal` is untouched by either leg: it is
already 0 throughout this whole span (`up = 1` since bar 1, `down = 0` until
the outro), so the mark shows as bare crescent at both `caption` and
`statement` — no name to worry about extending past the new station's smaller
size.

One consequence worth flagging rather than leaving implicit: `aura`
(`interpolate(size, [CAPTION_MARK, MARK.open.size], [0.3, 1])`) scales
automatically with the new station's `size: 124`, landing around 0.74 — a
noticeably brighter glow than the caption bullet's ~0.35. That is the existing
mechanism working exactly as designed (§5: "one component right at both ends
of the film" because everything is a fraction of `size`), not a new number to
add, but it does mean the mark will read as more prominent beside the
statement than it does as a caption bullet elsewhere in the film — which is
presumably the point of moving it down to be "on the left of" a headline
rather than a caption, but worth confirming by eye once built.

### 9.4 The bare stretch before the drop: implode, then explode

**Files:** `layout.ts` (new station), `Promo.tsx`'s `TravellingMark` (one more
journey), `Backdrop.tsx` (a new particle layer; existing `glow` fade-out
**kept, unchanged** — see below).

The brief: after "Video Editor," for the few seconds before the drop, "move the
logo back to the centre and make it go even more ecstatic with the build-up:
additional abstract moving particles and smoke effects in the gradient colours
around the logo, which implode before exploding just before the bass drops...
as the theme flips dark with a shimmer."

**The window, exactly:** `BUILD.breath` (bar 16, frame **1281**) to
`STAGE.harness` (bar 18, frame **1383**, the drop) — 102 frames, 3.4s, per
`beats.ts`. This is the same span §4 already calls "the most common way to
waste a drop" and describes as deliberately bare (the four features are done,
the track's accents have stopped, `Backdrop`'s build-up bloom is already fading
out). The brief is asking to fill it — deliberately, on purpose, as the film's
last build before the drop rather than a hole in it.

**The theme flip and the shimmer already exist and need no new work.** Wipe 6
in `wipes.ts` lands exactly on `STAGE.harness` (1383, direction ←, brings in
near-black) and `Promo.tsx`'s `STREAKS` list already has an entry at
`STAGE.harness` (length 26, intensity 0.6 — the longest and brightest streak
in the whole film, per its own comment: "the drop gets a longer, brighter one").
The brief's "the theme flips dark with a shimmer" is describing what this cut
already does on that frame; nothing here needs to touch `wipes.ts` or the
streak list.

**The mark: a new station, `MARK.breath`.**

```
breath: { size: 230, dx: 0, dy: 0 },
```

`dx: 0, dy: 0` — the *literal* stage centre (960, 540), not `MARK.open`'s
optically-adjusted one (§9.1). The brief says "exact centre" for this beat and
the two moments are doing different jobs: `MARK.open` is the mark at rest,
`breath` is the mark at its most agitated, and geometric centre is the more
defensible reading of "exact" for a beat about to be blown apart by particles.
`size: 230` (versus `MARK.open`'s new 168, §9.1) — noticeably bigger, the
biggest the mark is anywhere in the film outside a hypothetical bigger `connect`
station (180px) — chosen the same way `connect`'s extra drive is justified in
`MidniteWordmark.tsx`: with `reveal` at 0 (no name in frame, same as
`caption`/`column`/`statement`), there is nothing beside the crescent for a
harder scale to collide with, which is exactly the constraint that caps `thump`
at 14%/16% everywhere the name *is* visible.

**Insert one more leg**, after `fromStatement` and before `across` in the
chain (chronological order: `open → caption(up) → statement(toStatement) →
caption(fromStatement) → breath(toBreath) → column(across) → connect(toConnect)
→ close(down)`):

```
toBreath  frame [BUILD.breath, STAGE.harness - 10] = [1281, 1373]   0→1   (92 frames — a grow, not a snap)
```

Unlike every other leg in this chain (all `FLY = 18` frames), `toBreath` spans
almost the whole gap deliberately — the brief's "grows... through the build-up"
is describing three and a half seconds of continuous growth, not an 18-frame
pop followed by a hold. `across` (caption → column, unchanged: `[STAGE.harness,
STAGE.harness + FLY] = [1383, 1401]`) now runs from wherever `toBreath` left
the mark — full size, dead centre — down to the harness's small column station,
which is the "explode" reading of that leg: after 92 frames of swelling in
place, the mark snaps small and sideways in 18, exactly on the drop.

**Drive it harder**, the same mechanism `connect`'s `emphasis` already uses
(`drive(v) = min(1, v * emphasis)` applied to both `thump` and `punch`):
recommend `emphasis = 1 + toBreathProgress * 0.6` — a bit more than `connect`'s
0.55, since the brief's own word is "even more ecstatic" and this is the film's
one moment built to peak right before a drop, where `connect` is a quieter,
sustained beat. `toBreathProgress` here is the same 0→1 value as `toBreath`
itself, so the drive ramps up over the same 92 frames the size does, rather
than snapping on.

**The particles: a new layer, not `Backdrop`'s existing one.** `Backdrop.tsx`
already has a build-up atmosphere (`Particles count={18}`, two radial
gradients) but it is anchored at fixed *corners* — 24%/80% and 84%/22% of the
stage — built for a light-stage backdrop behind off-centre feature cards, not
for a mark now standing dead centre. Layering a new centre-anchored effect on
top of an unrelated corner wash is simpler and safer than trying to repurpose
one for the other. `shared/Particles.tsx` itself has no notion of "converge
toward a point then burst outward from it" — every mote's position is a
closed-form drift around a fixed per-index anchor spread evenly across the
*whole* frame (§ its own doc comment) — so this needs either a new radius
parameter on `Particles` or a bespoke component; this document fixes the
timing, count and colour, not the component's API, which is an implementation
choice for the build pass.

**Frame schedule**, referenced to `beats.ts`'s own documented frames rather
than to a freshly derived bar fraction (the acts table's own "17.3" label at
frame 1332 doesn't reduce cleanly against `bar()`'s fitted constants — using
the frame number directly sidesteps re-deriving a fraction that doesn't need
re-deriving):

| frames | span | what |
|---|---|---|
| 1281 → 1332 | 51f, bar 16 → "the breath" | **gather** — smoke/particles drift inward loosely as the mark grows past caption size; loose, not yet accelerating |
| 1332 → 1373 | 41f, the near-silent stretch | **implode** — particles/smoke accelerate toward the mark's centre, radius shrinking, timed against the track's own near-silence (44.4–46.1s) rather than against anything visual — the quiet is what the brief's "just before the bass drops" is anchored to |
| 1373 → 1383 | 10f | **peak compression** — particles collapsed to (or nearly into) the mark; mark at its largest, drive at its highest, held tight for the last ten frames before the hit |
| 1383 | STAGE.harness, the drop | **explode** — particles burst outward, coincident with wipe 6 and the existing f1383 streak (intensity 0.6) |
| 1383 → 1401 | 18f = FLY | explosion dissipates/fades while `across` carries the mark down to the harness column; by 1401 the stage should be clear — `HARNESS.skills.heading` starts typing at 1434, 33 frames later |

**Backdrop's existing `glow` fade: kept, unchanged, and here is why rather than
just asserting it.** `glow` (`Backdrop.tsx`) ramps 0→1 over `[BUILD.empower,
BUILD.empower+60]` = [1025, 1085], holds at 1, then fades to 0.1 over
`[STAGE.harness-110, STAGE.harness]` = [1273, 1383] — so across exactly this
edit's 1281–1383 window it is already most of the way through fading out (0.93
at 1281, 0.1 at 1383), and the layer unmounts entirely the frame after
(`!harnessLanded`). Two reasons to leave it alone rather than extend or hold
it: (1) it is spatially unrelated to a centred mark — its two radial gradients
sit at 24%/80% and 84%/22%, nowhere near (960, 540); (2) it is a *light-stage*
atmosphere, styled to sit behind feature cards, and this edit's particles are
meant to read as the mark's own energy rather than as more of that backdrop
texture. Reusing it would conflate two different jobs; a second, additional
layer keeps them legible as separate things doing separate work, which is also
why the schedule above doesn't touch `[BUILD.empower, ..., STAGE.harness]` in
`Backdrop.tsx` at all.

**Open note:** the exact particle count, palette weighting and implosion
radius curve are not measured numbers — there is no prior art in this file to
measure them against, and building the component is explicitly the next
pass's job, not this one's. What is fixed here is the schedule (five frames:
1281, 1332, 1373, 1383, 1401), the station (`size: 230, dx: 0, dy: 0`), the new
journey (`toBreath`, 1281→1373), and the decision to leave `Backdrop`'s
existing glow alone.

### 9.5 "Connect with" — the titles' own font, lower case

**File:** `stages/Outro.tsx`, the `<div>` inside `ConnectScene` currently
reading:

```
fontFamily: monoFontFamily,
fontSize: 34,
letterSpacing: "0.3em",
textTransform: "uppercase",
color: FG.muted,
```
```
Connect with
```

The brief: "The 'Connect with' font at the end should use the same font as all
the titles, and be in all lower case."

**"The titles" is `uiFontFamily` (Poppins)**, per `TypedTitle.tsx` (`fontFamily:
uiFontFamily`) — the component every page title in this film (`CaptionLine`,
the harness headings) is built on, per §5/§6. `stages/Outro.tsx` currently
imports `monoFontFamily` for this one line and nothing else in the file uses
it; `uiFontFamily` is already imported in the same file (used nowhere in
`Outro.tsx` today, but present in `shared/fonts.ts` and one import away).

**The text becomes literal lower case** — `connect with`, not
`textTransform: "uppercase"` over mixed-case source — since the brief asks for
the glyphs themselves to be lower case, not a case transform hiding them. Drop
`textTransform` entirely rather than setting it to `"none"`, which would be
the same outcome by a longer route.

**Size, weight and tracking — proposed, not measured**, for the reason §9.4's
closing note gives: there is no rendered "eyebrow set in `uiFontFamily`" in
this film yet to point `bbox.py` at, so this is a considered default rather
than a verified number, flagged for a look once built rather than asserted as
final:

```
fontFamily: uiFontFamily,
fontSize: 30,
fontWeight: 500,
letterSpacing: "0.08em",
color: FG.muted,          // unchanged
```

Reasoning for each number against the two things this line has to avoid —
reading as a title (it isn't one; four forge reveals and a call to action
follow it) and reading as a watermark (the fate `FG.muted` itself replaced
`FG.subtle` for, per §6's changelog note) — is:

- **34 → 30.** JetBrains Mono is a narrower face per character than Poppins at
  the same nominal size (the reasoning `CAPTION`'s own doc comment gives for
  going 44→50 in the other direction, moving *into* the UI face); dropping the
  size slightly keeps this line's *visual* weight roughly where it was rather
  than letting a proportional face at the same px number read larger and more
  title-like.
- **0.3em → 0.08em.** 0.3em tracking is sized for an upper-case monospace
  readout — the same idiom `ComingSoon`'s own eyebrow uses at 0.34em, still
  upper-case, elsewhere in this file. Lower-case Poppins at 0.3em is not an
  eyebrow, it is illegible: descenders and ascenders read as isolated marks
  once the letters are that far apart. 0.08em is a normal small-caps-adjacent
  eyebrow tracking for a proportional face at this size.
- **fontWeight 500.** Matches `CaptionLine`'s own title weight one step down
  (`TypedTitle` defaults to 600); light enough to read as secondary beside the
  forge names and the call to action that follow it in the same act.
- **`FG.muted` stays.** The existing comment on this line — "This line arrives
  in the track's quietest two bars with nothing else on the stage, and at
  `subtle` on near-black it read as a watermark rather than as the sentence the
  next four shots complete" — is exactly as true of the new typeface as the
  old one; nothing about switching faces changes that judgement.

**Nothing else in `ConnectScene` moves.** `OUTRO_EYEBROW_TOP` (482), the
`eyebrow` arrival interpolation (`[0, 14]`), and the forge/CTA layout beneath
it are all independent of this line's font and are untouched.

### 9.6 Summary and open items for this round

| # | edit | file(s) | key numbers |
|---|---|---|---|
| 1 | mark's true vertical centre | `layout.ts` | `OPEN.dy`: `462−540` → **`537−540`** (dy −78 → −3), measured ink centre 465 in a box centred 462 |
| 2 | remove `>_` from the intro | `stages/Intro.tsx` | `Prompt` component + call site deleted; `PROMPT_UNFURL` 200 → 48 (proposed); `PROMPT_IN`/`PROMPT_OUT` untouched |
| 3 | mark beside the build-up statement | `layout.ts`, `Promo.tsx` | new `MARK.statement = {size:124, dx:-621, dy:10}`; `toStatement` [974,992], `fromStatement` [1076,1094] |
| 4 | implode/explode before the drop | `layout.ts`, `Promo.tsx`, `Backdrop.tsx` | new `MARK.breath = {size:230, dx:0, dy:0}`; `toBreath` [1281,1373]; particle schedule 1281→1332→1373→1383→1401; `Backdrop`'s `glow` fade left unchanged |
| 5 | "connect with" in the titles' face | `stages/Outro.tsx` | `monoFontFamily`→`uiFontFamily`; text literal lower case; proposed 30px/500/0.08em |

**Blocking nothing** — all five are specified precisely enough to build from
without a further round-trip to the client, except where flagged inline:

- **9.1** — the 75px shift is real and measured; whether the client meant
  "true centre" or "a smaller nudge" is a sign-off question, not a build
  blocker (build to true centre; it is the only defensible reading of "move
  the logo to be vertically centred").
- **9.3** — the 153px vs 32px gap asymmetry between the two statements is a
  known, disclosed tradeoff of "one station," not an error; revisit only if
  the finished cut reads as loose.
- **9.4** — particle count/palette/implosion-curve specifics are an
  implementation choice for the build pass, not a planning gap; the schedule,
  station and the decision to leave `Backdrop`'s glow alone are fixed.
- **9.5** — size/weight/tracking are proposed defaults with reasoning, not
  measurements (nothing in this face/case/size combination exists yet in the
  film to measure); confirm by eye once built.

Everything from §§1–8 (rounds v1–v3, the asset inventory, the beat grid, the
render-cost notes) is unchanged by this round and was not re-verified for it.
