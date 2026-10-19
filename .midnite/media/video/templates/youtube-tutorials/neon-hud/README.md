# Template — neon HUD (youtube-tutorials)

The look of the `youtube-tutorials` series: kinetic headlines over small glowing
diagrams on a near-black stage, cut to the music's phrasing. Extracted from
**DEEPTECH AI LABS — "FUGU Proves Intelligence Isn't What You Think"**
(`youtu.be/D8P_lcyYrsw`, 5:48, 1080p60) by sampling its frames and measuring
its audio. The template copies the *grammar* only, never the footage or the
music.

```bash
node scripts/render.mjs templates/youtube-tutorials/neon-hud
node scripts/render.mjs templates/youtube-tutorials/neon-hud annotated --comp TemplateNeonHudAnnotated
```

| Half | Where |
|---|---|
| The kit, shared by every episode | `video-editor/src/shared/neon-hud/` |
| This template's composition | `video-editor/src/templates/youtube-tutorials/neon-hud/` |
| The copy, the only file to edit | `…/neon-hud/content.ts` |
| The clock | `…/neon-hud/beats.ts` |
| The music brief | [`MUSIC.md`](MUSIC.md) |

## What the reference does, measured

**The stage.** Near-black (`#03060b`) rather than pure black, with a cool radial
lift (`#0a1b2e`) behind the centre and a heavy vignette. The picture never cuts
hard: there are *zero* scene cuts at ffmpeg's 0.15 threshold. Every change of
picture fades through black over ~0.4s, so the lift showing through is the only
thing on screen for a few frames.

**Pace.** Picture changes every **3.45s** (median, measured from the brightness
dip between scenes), which is about seven beats at the bed's ~123 BPM. The
template rounds that to **eight beats (3.9s)** so scenes sit on 16-beat
phrases.

**The headline.** It has two lines, and they do different jobs:

- **A, the setup.** White (`#f2f8ff`) with a cyan halo. It resolves in place, one
  letter a frame apart.
- **B, the payoff.** In the beat's tone. Each letter starts scattered (offset,
  rotated, scaled up, blurred), then snaps into place a frame after the one
  before it, flaring as it lands. Caught mid-flight in the reference it reads
  "AL O N E", "SCO R I N G", "F R O M".
- **Stack or inline.** B goes under A when it is the answer to A ("NOT SMART /
  ALONE"). It goes beside A when the two read as one phrase ("PICKS THE
  BEST").
- **Type.** Roboto Black, all caps, set at 92px for B and 82% of that for A
  when stacked.

**Order inside a beat**, from a 10fps frame burst:

| Beat | What happens |
|---|---|
| 0 | fade up; the diagram starts building (nodes pop, numbers count up) |
| 0.5 | line A resolves |
| 2 | line B flies in |
| 2.25 | the diagram dims to ~55% so the payoff word gets the frame |
| 2.75 | the HUD pill switches on: the border draws out from the centre, then the text |
| end − 0.4 | fade to black |

**Colour carries meaning.** Cyan is the default. Green and amber are the two
sides of a comparison. Red is used only for negation: "NOT", "NO", or a card
struck through.

**The diagrams.** No screenshots and no stock footage. Every beat is one small
diagram built from outlined, glowing primitives, labelled in tiny letter-spaced
mono caps. The kit's `Visual` kinds cover what the reference uses, plus a
terminal for tutorials:

| Kind | Reference beat it comes from |
|---|---|
| `compare` (optional red strike) | "7B GIANT KILLER", "NOT FRONTIER / NOT REASONING" |
| `hub` (core, satellites, routed pick) | "PICKS THE BEST", "THE TRAFFIC COP" |
| `stat` (huge count-up number) | "ROUTES IN MILLISECONDS · 11 ms" |
| `gauge` | "ACCURATE YET TINY · 98%" |
| `bars` | "SHARPER EACH ITERATION", "HIDDEN STATE SCORE ALL" |
| `lines` | "LATENCY HOLDS FLAT" |
| `steps` | "THINK · WORK · VERIFY" |
| `checklist` | "OUTPUT · VERIFY" |
| `badge` | the closing "JUST BE RIGHT" check |
| `terminal` | *not in the reference*, added for tutorials |

**Sound.** The reference runs at about 123 BPM, probably in F minor, and is
mastered loud and flat: −11.8 LUFS integrated with a loudness range of only
2.8 LU, so the bed never drops out under the voice. There are short dropouts at
act changes and a whoosh on most picture changes. See [`MUSIC.md`](MUSIC.md)
for the brief.

## The template's timeline

The placeholder bed is `assets/audio/music/soulprodmusic-gym-energy-514739.mp3`,
the closest match in the library: 123.05 BPM, G minor, with its beat grid
starting at frame 0. The sections hang on its phrases:

| Beats | Slot | On the bed |
|---|---|---|
| 0–32 | hook: 4 scenes (`compare`, `hub`, struck `compare`, `stat`) | pads, then drums in at 16 |
| 32 | chapter card 01 | section change |
| 40–64 | 3 scenes (`terminal`, `steps`, `bars`) | |
| 64 | chapter card 02 | section change |
| 72–96 | 3 scenes (`gauge`, `lines`, `checklist`) | |
| 96–112 | outro (16 beats): badge, channel line, subscribe pill, impact | the break |

That comes to about 55s. A real episode just has more slots: the timeline is a
list, and each slot is eight beats.

## Making an episode from it

See [`projects/youtube-tutorials/README.md`](../../../projects/youtube-tutorials/README.md).
