# Template — the go-live promo

The grammar of [`projects/midnite/marketing/001-golive-promo`](../../../projects/midnite/marketing/001-golive-promo)
(88s, eight rounds of client edits) in a **26-second, fifteen-bar showcase**.
Every kind of beat the promo has appears once. Wherever the promo had copy or a
screen recording, the template has a placeholder in square brackets.

- **`TemplateGolivePromo`**: the showcase as it would be cut.
- **`TemplateGolivePromoAnnotated`**: the same, with the documentation drawn
  over it. The top-right chip gives the section, what it demonstrates, the frame
  and bar, the stage, and the wipe in flight with its direction, length and
  progress. The strip along the bottom is the whole timeline, coloured by stage,
  with a playhead.

```bash
cd video-editor && npm run dev                         # Studio → templates-midnite-golive-promo
node scripts/render.mjs templates/midnite/golive-promo annotated --comp TemplateGolivePromoAnnotated
node scripts/render.mjs templates/midnite/golive-promo check --still 440   # one frame → output/_stills/
```

## Where things are

| File | What it holds | Edit it to… |
|---|---|---|
| `video-editor/src/templates/midnite/golive-promo/content.ts` | every word and every placeholder | turn the showcase into a first cut |
| `…/beats.ts` | the bar grid, and the frame each section lands on | retime to a real track |
| `…/wipes.ts` | every change of stage, and `themeAt` / `themeMixAt` | move a light/dark flip |
| `…/parts.tsx` | the building blocks: placeholder card, strike, claim, statement, breath, slugs, colour card, outro, lockup | change how a kind of beat looks |
| `…/Template.tsx` | the sequence of sections, the backdrop, the annotation overlay | add, drop or reorder sections |
| `input/BRIEF.md` | a brief in the promo's five-stage shape, with blanks | start the next brief |

Nothing in the template imports from the promo's folder. It builds only on
`video-editor/src/shared/` (brand tokens, fonts, `MidniteWordmark`,
`LiquidWipe`, `ShimmerLine`, `TypedTitle`, `Typewriter`, `SmokeStreak`,
`Particles`, `loopIcons`), so the promo can keep changing without breaking it.

## The timeline

At the promo's own tempo: one bar is 51.08 frames (1.70s) at 30fps.

| Bar | Frame | Section | Stage | How it arrives | The promo's version |
|---|---|---|---|---|---|
| 0 | 0 | Intro | black | — | Stage 1: the typed terminal lines and the mark |
| 1 | 51 | Lockup | black | name unfurls from the mark; qualifier typed | the reveal at the first hit |
| 2 | 102 | Claim · first hit | **light** | **long** wipe →, card struck from the top | "Launch any agent" |
| 3 | 153 | Claim | light | hard cut on the bar, card from the right | "Manage multiple git repos" |
| 4 | 204 | Claim · to dark | **dark** | short wipe ←, card from below | "Watch your swarm" |
| 5 | 255 | Claim · to light | **light** | short wipe →, card from the left | "Knowledge graph" |
| 6 | 306 | Statement · dark half | **dark** | short wipe ←, line lands with it | "Replace no one" |
| 7 | 358 | Statement · light half | **light** | short wipe →, glow and motes rise | "Empower everyone!" |
| 8 | 409 | Breath | light | mark to centre; motes implode by bar 8.85 (452) | the strip-back and `Crescendo` |
| 9 | 460 | Drop | **dark** | short wipe ← + shimmer across the stage | the drop: "Agent Skills" |
| 9.25–9.75 | 472–498 | slugs | dark | one typed line every quarter bar | `/ideate`, `/create`, `/review` |
| 10.5–11.5 | 536–587 | Colour cards | dark | one every half bar, each with a shimmer | "Agent Loops" |
| 12 | 613 | Claim · light again | **light** | short wipe → | "Agent Graphs" |
| 13 | 664 | Outro · connect with | **dark** | short wipe ← | "connect with" and the forges |
| 14 | 715 | Outro · lockup | dark | lockup builds; call to action | the last boom |
| 15.5 | 792 | end | | | |

## The two stages

Every midnite video stands on one of two stages, and **everything drawn on
it asks the stage what colour to be**. Nothing hard-codes it. The tokens are
transcribed from midnite-studio's own `tokens.css` into `shared/brand.ts`:
`THEME.dark` and `THEME.light` carry the same keys, so a component takes a
`Theme` and reads one object.

- **`themeAt(frame)`** picks a whole token set: which cut of the logo, which
  ramp, how bright a halo is. Half a theme is not a theme, so this is discrete.
- **`themeMixAt(frame, x)`** is continuous: 0 on dark, 1 on light, and
  in between while a wipe's smoke is crossing column `x`. Use it for any colour
  that has to stay legible *during* a wipe, such as a title's ink. Pass the
  x where the object actually is, not where it started. An earlier promo cut
  hand-timed these crossfades instead, and two of four were wrong: a white
  crescent on white paper for a quarter of a second.
- **The light stage has its own ramp** (`LIGHT.RAINBOW`). Each hue is darkened
  only as far as needed to clear 4.5:1 on white. Gradient text on light never
  needs a backplate.
- **Placeholder cards stay dark on both stages**, because every real shot is an
  app window. The halo behind a card is stronger on dark (0.40) than on light
  (0.26).
- **Colour cards stay on the dark stage.** Their hues are Tailwind 500s, and
  cyan-500 on white is 2.6:1. When the colour is the point of a beat, the
  light stage would take it away.
- **The light stage can carry atmosphere**: the statement's glow and motes are
  mounted directly above the wipe that brings that stage in, so the next wipe
  covers them with no hard edge.
- **Light windows on a dark stage** (the promo's v7 Multi-window) read as
  separate objects. On white paper the gaps between white windows disappear.

## Transitions

| Transition | Where | Rule |
|---|---|---|
| **Liquid wipe, long** (46f) | the first change of stage | the film's first flip is meant to be watched |
| **Liquid wipe, short** (26f) | every other flip, and the drop | two a bar apart must never overlap; a drop is a cut, and a long dissolve there lands late |
| **Hard cut on the bar** | claim to claim on one stage | the default; a wipe only when the stage changes |
| **Strike** (7f, 70%→100%, eased out) | every card | struck onto the stage by the beat and over before the transient ends |
| **Shimmer across the stage** (`SmokeStreak`) | the drop, each colour card | short (18–22f), over everything |
| **Shimmer along type** (`ShimmerLine`) | statements, colour-card names, outro names | a sawtooth: it crosses, then waits off the edge |
| **Typing** (`Typewriter`, `TypedTitle`) | titles, slugs, qualifier, "connect with" | frame-derived, so scrubbing back un-types |

Rules for wipes, all in `wipes.ts`:

- **Directions alternate** (→ ← → ←), so the stage reads as being dealt, and
  each theme is entered from both sides.
- **Every wipe has its own `id` and `seed`.** SVG filter ids are
  document-global, and two wipes sharing one silently share one filter.
- **The accent riding the wipe's edge is a ramp stop** of the theme it is
  arriving at.
- **A section lands on the frame its wipe starts.** The words arriving and the
  stage turning over read as one event, which is why the title's ink must read
  `themeMixAt` for those first frames.
- **Flips go on bar lines with an onset under them.** The promo's flips all
  sit on measured hits, and its biggest section change is the track's own.

## Layout

- **The tour window is 1391×840**, centred, top at y=164, with the title on a
  60px line at y=64 above it. Every claim uses the same card size, so nothing
  moves between cuts.
- **Titles are left-aligned to the window's edge**, with the mark at the head
  of the line. The mark is a persistent object: it cannot move between cuts
  just because the next title is shorter.
- **Centred type over a card** (the slugs) sits on a radial scrim, in
  fixed-height slots, each mounted only on its beat. That keeps the column
  from shifting as lines arrive, and no caret blinks early. A placeholder
  behind centred type puts its label in the corner.
- **Gradient text needs overhang room.** `background-clip: text` paints only
  inside the box, so descenders get cut off square (the promo's v7 fix).
  Pad the box and give the space back with an equal negative margin.

## Motion rules

- **Deterministic.** Every position is a closed-form function of the frame
  (and an index): no state, no effects, no unseeded randomness. Any frame
  renders the same on its own, which is what makes stills trustworthy.
- **Everything comes from `bar()`.** No section holds a bare frame number.
  Retiming for a track means changing `BAR` and `ORIGIN` in `beats.ts`.
- **The ending rhymes with the opening.** The promo is a true loop, with its
  last frame identical to its first, verified by PSNR across the seam. The
  template ends on the lockup it opened with. See the promo's `MARK.close ===
  MARK.open` and `auraLoop` for making it loop exactly.

## Not in the template

These live in the promo and are worth lifting when a video needs them:

- **The music**: `energy.ts` (the bass envelope baked per frame by
  `scripts/make-track-envelope.mjs`), and `thump`, `punch` and `bands` driving
  the mark, the card shake and the spectrum ring (`MarkWaveform`).
- **The travelling mark**: one lockup that flies between stations (centre,
  caption head, beside the statement, centre again) along a lerp chain in
  `Promo.tsx`, with its stations in `layout.ts`.
- **Sound**: `SfxSound` whooshes on every cut, the riser and impact on the
  drop, and `TypingSound` keyclicks derived from the same schedule as the
  glyphs.
- **Real footage**: `AppWindow` with a source-pixel `crop`, `clips.ts`'s
  fit-check (which fails the bundle rather than freezing a clip), and the
  two-speed shot that lands three recorded events on three beats (v6).
- **The multi-window build**: windows detaching from a main window on the
  beat (`stages/MultiWindow.tsx`).

## Starting a video from this template

1. `cp -R projects/_template projects/<brand>/<category>/NNN-name`, then copy
   this template's `input/BRIEF.md` over its brief and fill in the blanks.
2. `cp -R video-editor/src/templates/midnite/golive-promo
   video-editor/src/projects/<brand>/<category>/NNN-name`. Fix the `../`
   depth of the `shared/` imports, rename the compositions in `register.tsx`
   (ids are global), and add one line to `src/Root.tsx`.
3. Measure the track (`tools/audio-envelope.mjs --onsets`) and set `BAR` and
   `ORIGIN`. Move the sections to the bars the music gives you.
4. Fill in `content.ts`. Swap each `PlaceholderCard` for an `AppWindow` as its
   recording lands.
5. Then carry on with `/video-write-editorial-script` and
   `/video-execute-editorial-script` as for any project.
