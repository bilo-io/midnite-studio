# Template — ink morph (explainers)

A voice-led explainer drawn in brush ink, where every scene arrives *through*
the one before it. Extracted from **BUCK for Good Books — "Metamorphosis"**
(`vimeo.com/35720685`, 2012, 2:42, 16:9) by watching it frame by frame at
about 1.5 samples a second. The template copies the *grammar* only: the
grounds, the palette discipline, the drawn-on-twos motion, the transitions,
the type treatment and the pacing. It takes none of the film's script, voice,
music, characters or artwork. Every mark in the composition is the kit's own
procedural drawing, and every subject is a labelled placeholder.

```bash
node scripts/render.mjs templates/explainers/ink-morph
node scripts/render.mjs templates/explainers/ink-morph annotated --comp TemplateInkMorphAnnotated
node scripts/render.mjs templates/explainers/ink-morph check --still 400
```

| Half | Where |
|---|---|
| The kit (grounds, ink, reveals, type) | `video-editor/src/shared/ink-morph/` |
| This template's composition | `video-editor/src/templates/explainers/ink-morph/` |
| The copy and each scene's accent, the file to edit | `…/ink-morph/content.ts` |
| Scene order, lengths and how each arrives | `…/ink-morph/beats.ts` |
| What each scene draws | `…/ink-morph/scenes.tsx` |

## What the reference does

**Two grounds, alternated hard.** Cream paper and a black void, and almost
nothing in between. The film keeps switching between them, and that switch is
most of its rhythm. Paper scenes are drawn in black ink; void scenes are drawn
in white chalk, or open a window onto paper.

**One accent per scene.** The palette is black, cream and three accents:
magenta, a pale teal and a hot red-orange. A scene wears one of them and the
next usually wears another. The one long scene that changes accent mid-shot
(the morph) does it as an event: the colour pops in on a flick of the brush.

**Drawn on twos, and it boils.** Motion advances every second frame, so the
film moves at twelve drawings a second. A finished line is never still: its
edges crawl from drawing to drawing, the way a line traced three times crawls.
Liquid does not flow smoothly either. Blobs inside a pool jump to new places
each drawing, which reads as boiling paint.

**Things are drawn on, never faded on.** Line work grows along its length.
Chalk forms build up out of hatching, densest on the lit side. Type writes
itself on (the script line) or snaps into place letter by letter (the caps).
The one exception is the very first beat: a white flash, then grey, then black,
like a set warming up.

**Every scene arrives through the last.** The film is close to one continuous
shot. The transitions, roughly in order of how often it uses them:

| Kind | What it looks like | In the template |
|---|---|---|
| **Bloom** | ink in the outgoing scene grows, flings splatter, and floods the frame; the next scene is inside it | `bloom` reveal; scenes 3, 5, 9 |
| **Push-through** | the camera flies into an object (a screen, a lens, a cup) until its inside is the next shot | `lens` reveal; scene 2, and the lens → slit pair |
| **Dry-brush wipe** | a ragged black band drags across the frame at an angle, bristles leading | `wipe` reveal; scene 7, and the title band |
| **Aperture** | a narrow slit, or an eye-shaped almond, opens out of black | the slit and almond scenes; `almond` reveal into scene 8 |
| **Hard cut** | one deliberate hard cut, into a stark two-tone room (scene 4); its rarity gives it force. Scenes 1, 6 and 10 also use `cut`, but only as structural entry/exit points (opening, the slit, the credits) | `cut`; scenes 1, 4, 6, 10 |

**Type appears twice.** The title card is a black dry-brush band painted across
a pale wash, with the title in a bookish serif behind the brush head, the
author pinned to the far end and a small mark at the start. A tiny creature
walks along the top of the band while it holds. The credits put a short
handwritten line above a name in wide-tracked serif caps, beside an object
hatched in chalk. There are no captions: the voice-over carries every word.

**Pacing follows the voice.** Beats run 4–10 seconds and change on the
narrator's phrasing, not on a music grid. There are two long holds: about six
seconds on the title card, and about ten on a single splat near the end, where
the only motion is something small crawling across it.

## The template's timeline

About 73 seconds at 24fps: the reference's order and proportions, with each
beat trimmed to roughly half.

| # | Scene | Ground | Arrives by | Length | What it stages |
|---|---|---|---|---|---|
| 1 | screen | void → paper | — | 5s | flash, a chalk smear that resolves into a bulging screen, a flat room drawn on inside it, a figure popping in |
| 2 | overhead | paper | lens (into the screen) | 7s | an object from above, drawn on; its contents boil, the outline spirals into a vortex, then the ink blooms and splatters |
| 3 | title | paper wash | bloom | 8s | the brush band paints the title on; a critter walks the band; the band rises to fill the frame |
| 4 | room | void + paper | **cut** | 6s | ceiling grid in perspective, hard light shafts, a lit window on the floor, one hot lamp, rain scratches, a slow roll |
| 5 | lens | paper | bloom | 7s | splats gathered round one crisp lens fly off as a flock; the lens grows until its sky fills the frame |
| 6 | slit | void + teal | cut (out of the lens) | 6s | black closes from the sides to a narrow tilted panel; heavy brush strokes inside; scratches flicker in the black |
| 7 | almond | void | wipe | 5s | an almond opens from a hairline onto marbled line work, spraying droplets off its tip |
| 8 | morph | paper | almond (opens out) | 11s | a vortex condenses into one form that keeps rolling, squashing and changing accent: the long riff |
| 9 | hold | dark grain | bloom | 8s | one big splat between two page edges, a critter crossing it |
| 10 | credits | void | cut | 10s | two credits, each beside a chalk-hatched object; ends on a white flash |

## Making a film from it

1. Write the voice-over, and split it at the scene boundaries above. Put each
   line in `content.ts` (`scenes.<id>.vo`), plus the title, author and credits.
2. Time the recording, and set each scene's `seconds` in `beats.ts` to its line.
3. Replace each scene's placeholder subject in `scenes.tsx`, keeping its ground,
   its accent rule and how it arrives and leaves. Draw with the kit
   (`DrawOn`, `InkBlob`, `MarbledPool`, `Splatter`, `Hatching`) inside a
   `Boil`, so new marks move like the old ones.
4. Render `TemplateInkMorphAnnotated` first: it labels each scene, its reveal
   and its VO line over the picture.

Rules worth keeping: one accent per scene; one deliberate hard cut (plus the structural ones at the open, the slit and the credits); nothing fades
on; anything that moves reads `useDrawing()` or `onTwos()`, never the raw frame.
