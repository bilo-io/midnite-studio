# Cuts — midnite/marketing/001-golive-promo

The mp4s under `output/` are gitignored; this file is the tracked record of what
changed between them. One entry per render, newest first.

---

## v10-you-decide — new intro lines

`output/v10-you-decide.mp4` — 88.06s, 31.7MB. v9 with only the intro changed.

- **New copy.** The five typed lines are now "Agent Orchestration System?",
  "Agentic Git Client?", "A.IDE...?", "..." and "You decide!". They replace the
  old AI/AGI/Singularity/"Harness the beast" run one for one, so each line keeps
  its old bar, speed and pauses: the long pause is now after "A.IDE...?", and
  "You decide!" is typed at the slow speed and erased before the hit.
- **The intro uses the title face now.** The lines are set in Poppins 600 with
  `TypedTitle`'s tracking instead of JetBrains Mono 400. Size (56) and caret
  are unchanged.

---

## v9-agentic — the agentic recordings

`output/v9-agentic.mp4` — v8 with two shots changed. **There are no title cards
left.**

- **Agentic kanban** is now real footage: the light take (bar 9 is on the
  light stage), from 0.2s at 1.5×. It shows the card dragged from Todo to In
  Progress and the agent's terminal opening, all inside the claim's one bar.
- **Agent Graphs** is now the dark agentic-graph take, from 0.1s at 1.05×. It
  replaces the dark workflows take, so the workflow builder is no longer in the
  film twice. It uses the dark cut because the light one is 4.35s against a
  5.13s movement and would have had to be slowed down.

Outstanding: sign-off on the 88.0s runtime.

---

## v8-ideate — a rename in Agent Skills

`output/v8-ideate.mp4` — v7 with one change. The skills column now reads
`/ideate`, `/create`, `/review`: "/brainstorm" is renamed "/ideate" and moved to
the top. Nothing else moved.

---

## v7-polish — the client's seventh round

`output/v7-polish.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 29.4MB.
Loop seam 48.2dB, unchanged. **One beat is still a title card** (Agentic
kanban).

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v7)* section.

- **Placeholder titles lost their descenders.** Gradient text is only painted
  inside its own box, and at the title card's 1.1 line height the "g" of
  "Agentic" hung out of the bottom and was cut off square. The label now has
  padding for the overhang, cancelled by an equal negative margin so nothing
  moves. The harness's typed gradient slugs had the same exposure ("/loop") and
  got the same fix. `TypedTitle` and `ShimmerLine` already had this room.
- **Watch your swarm** is now the dark multi-window take from 5.1s, after all
  three panels have folded. It plays at 1×, replacing the old take slowed to
  0.40×. Settled with the client: the dark clip, on the dark stage it already
  stood on.
- **Multi-window is on the dark stage** (`wipe-multiwindow` on its cut,
  `wipe-councils` back to light for AI Councils) and keeps the light takes.
  The main frame is 760 tall instead of 840, so after the shrink the terminal
  gets 290px instead of 242, and there are 32px between windows instead of 16.
  The detach beats and the two-speed timing are unchanged.
- **Agent Skills:** `/execute` becomes `/create`.
- **Agent Loops:** the name's highlight crosses the icon too. It uses the same
  band, a second copy of the glyph painted through a moving gradient, and a
  glow in the loop's colour swells as it passes. Under everything is a faint
  (11%) radial wash of the current loop's colour, blending into the next one
  over the six frames either side of each change.

Outstanding: the Agentic kanban recording, and sign-off on the 88.0s runtime.

---

## v6-multi-window — the client's sixth round

`output/v6-multi-window.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC,
30.4MB. Loop seam 48.2dB, unchanged. **One beat is still a title card**
(Agentic kanban).

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v6)* section.

### Stage 3 is three features now, and the first is two bars

The Video Editor card is gone, and Multi-window takes its bar (bars 12–14).
AI Councils and Workflows are unchanged at a bar each, so the build-up and
everything after it keep their frames: no beat outside `BUILD.items` moved.

### Multi-window comes apart on the beat

It opens on the tour's usual window, the main-window recording with all three
panels open. Then, one panel at a time, the panel folds away in the app and its
own window appears beside the main one with a 16px gap: loops on the right,
repos on the left, the terminal underneath. The main window slides, shrinks and
rises to make room, and it is only ever transformed, never re-fitted, so its
picture does not swim.

- **The hits are the off-beat accents, not the bar lines.** These two bars have
  almost no bass (`PUNCH` 0.00–0.01), and what carries the pulse is a half-bar
  accent measured at frames 1083, 1108, 1134 and 1159. The first comes seven
  frames after the cut, so the panels take the last three (`BUILD.detach`).
- **The fold leads and the window lands on the hit**, as asked in the round's
  follow-up. Each fold in the recording *finishes* on its accent, so the
  collapse is seen 4–6 frames before the beat. The main window also starts
  making room 4 frames early: each detached window's reveal starts behind where
  main is standing, and without the lead it was hidden for its first frames and
  read as late.
- **The main take runs at two speeds** (1.94×, then 1.08× from the repos fold),
  joined with no jump in source time. The recording's folds are 1.7s and then
  0.9s apart, and the accents are evenly spaced, so one rate could not put all
  three on their beats. `clips.ts` derives both rates and the trim from the
  measured fold times, and checks the two-speed shot against the clip's length.
- **Light takes throughout**, because stage 3 is on the light stage. The dark
  takes are imported too but unused, and there is no dark terminal take.
- The terminal window is a strip at main's width (about 4:1 against the take's
  1.7:1), cropped to the agent status table, the ETA line and the prompt.

Outstanding: the Agentic kanban recording, and sign-off on the 88.0s runtime.

---

## v5-edits — the client's fifth round

`output/v5-edits.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 29.4MB.
**Three beats are still title cards** (Agentic kanban, Multi-screen, Video
Editor), so this is still a rough cut until they land.

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v5)* section.
That round arrived truncated and three of its gaps were settled with the client
before anything was built — see the *Corrections* at the foot of the brief.

### The lockup's caret was never brought in line, and now is

v3 gave every caret in this film one geometry: from 0.73em above the baseline to
0.04em below, which is within three hundredths of the cap height of both faces
the repo sets. The lockup's own caret was missed, because it is positioned from
the *line box* rather than from the baseline and so looked unrelated to the
numbers that fixed the others. Measured on the outro lockup at f2450, against
the cap of the "S" beside it:

| | top | bottom | height |
|---|---|---|---|
| caret | 489 | 567 | 79 |
| "S" cap | 512 | **574** | 63 |

Which is the client's "a bit too far up" exactly: it began 23px above the
capitals and its foot hung 7px clear of the baseline, so it read as floating
rather than as sitting on the line. At the ≈88px that station sets, the
convention's 0.77em puts it at **510–576** — two pixels proud of the caps at
each end, resting on the baseline like the type. Re-measured on the render.

### The ring is heavier

Spokes from `0.22 + v·0.62` to `0.38 + v·0.58`, motes from `0.25 + v·0.55` to
`0.40 + v·0.54`, and the conic aura's floor from 0.42 to 0.58. The client asked
for "a little more opaque… more visible in dark mode too", and the floors are
what moved rather than the peaks: the ring was already bright on a loud frame
and invisible on a quiet one, so lifting the term that does not depend on the
music is what makes it present between kicks.

**This is why the loop seam is 48.1dB against v4's 50.4.** Frame 2639 and frame
0 differ only in the spectrum ring, which is one frame's worth of music apart
across the wrap; making the ring heavier makes that difference heavier too. It
is the same cause v3 recorded when the seam went from 54dB to 50.4dB on the ring
being added at all, and 48dB is still the same picture.

### The particles go all the way in

v4 stopped the field at a 190px radius — a ring riding the outside of the mark's
glow — because an earlier cut had collapsed it to 46px and vanished behind the
logo at the one frame the whole build exists for. The client asked for the
opposite and is right: *"the particles should accelerate towards the centre of
the logo, and all make it inside before exploding."*

Both notes are satisfiable at once, and what reconciles them is that a mote
arriving at the centre should not still be a 40px disc. The radius now runs to
zero on an ease-**in**, so the field is at its widest for most of the run and
does the last third of the distance in the last few frames — which is what
"accelerate" means — and each mote is shrunk and faded over the final stretch of
its own approach, inside the crescent's own 115px radius. What reads is a swarm
being drawn in and **swallowed**, rather than one sliding behind a disc.

The separate "peak compression" hold is gone with it. A field still travelling
on the frame the drop lands is what "all make it inside before exploding" asks
for, so the schedule is three segments where §9.4's table had four.

### "Agentic kanban" is last, and that cost more than a line

Moving it from bar 5 to bar 9 is one number. What it broke is that `clips.ts`
expresses every shot's length as *the gap between its own beat and the next
one* — `CLAIM.kanban - CLAIM.swarm`, and so on down the tour. Move one beat and
three of those pairings are pointing at the wrong neighbour: the swarm shot
asked for 255 frames of a 5.19s clip and the render refused, which is the good
outcome. The chain is re-linked and every claim is 51 frames again.

The grid did not move. Every claim is still one bar, the tour is still eight of
them, and both wipes inside it are still on bars 4 and 8 — the bar-8 one is
simply named for the knowledge graph now rather than the system monitor, because
that is what stands on it. Bar 8 is the track's own section change and keeping a
flip there mattered more than keeping the wipe's name.

### Stage 4's first two movements changed layout

**"Agent Skills"** and **"Agent Loops"** no longer use the column-and-panel this
act was built on. They borrow the *tour's* layout — the card centred, the
heading over it — and stand their type on the picture, which is the client's own
instruction: *"rather than bullets on the left, each should be typed out in the
center, over the video, which is now also centred."* It is `ClaimSlide` rather
than a fourth layout, because that component is already a centred card with a
typed heading and a slot over it.

- **Agent Skills** is `/execute`, `/review`, `/brainstorm`, typed one per beat in
  the brand ramp with the ramp turning while each is up.
- **Agent Loops** is `/loop`, then the six loops at half a bar each — glyph
  above, name typed in the loop's own hue with a caret to match, and a line of
  copy under it in the stage's ink. Only the name is typed: a card up for 25
  frames cannot have three things arriving in sequence and still be read.
- Each loop lands under **two** shimmers, which the brief asks for separately and
  which are different objects — a `SmokeStreak` in that loop's colour across the
  whole stage, and `ShimmerLine`'s ramp travelling along the name's own stroke.

**Agent Graphs** and **AI Companion** are title changes only, confirmed with the
client. They keep their items and their column layout, so the act is
deliberately in two layouts now — a name being invoked, against a list of what a
thing does.

Three things worth keeping from building it:

- **The skills column reserves its height.** Three lines arriving a beat apart
  into a centred stack means a stack that grows, and a centred box that grows
  moves its existing contents *upward* on each new line. Each slot holds its line
  box from frame one, and each `Typewriter` is mounted on its own beat rather
  than hidden until then — an unmounted line has no caret, and three carets
  blinking in a column is a form, not a sentence being written.
- **The type is scrimmed.** These two movements put 34px grey copy and a green
  word on top of a dense IDE recording. A radial wash under the stack, nothing at
  the edges, so the card still reads as the app running.
- **`Typewriter` gained `caretColor`.** Its bar caret was hard-wired to the brand
  ramp, which is right everywhere else in the film and wrong beside a word
  painted in one flat loop colour — a rainbow caret there is the one part of the
  line that is not the thing being named.

### The loop icons are generated, not copied

`scripts/make-loop-icons.mjs` reads midnite-studio's own
`features/loops/loop-icons.ts` and `loop-glow.ts`, resolves each loop's
`react-icons` component out of the installed package, and writes
`shared/loopIcons.tsx`. Same argument as `agentAccents.ts`: a hand-copied glyph
or hex is a second list to keep in step with the app's, and the one that drifted
would drift silently — a video showing last year's icon in this year's colour
still renders and still passes every check.

`--check` fails when the module is stale, and the generator refuses to run at all
if the app has remapped a loop to a different glyph. Both were tested by
temporarily renaming `medic`'s icon in the app: it errors rather than baking the
wrong one.

Two things it settled that the brief had left open. The client gave five of the
six colours and they match the app exactly, so `/concepts` — the one with no
colour named — is cyan **by elimination rather than by choice**. And the client's
names are renames of the app's ids, which is why the generated table carries
both:

| brief | app id | icon | hex |
|---|---|---|---|
| `/guard` | `guard` | `LuShieldCheck` | `#22c55e` |
| `/concepts` | `innovate` | `GiOvermind` | `#06b6d4` |
| `/develop` | `automate` | `SiClevercloud` | `#3b82f6` |
| `/patrol` | `watchdog` | `SiSecurityscorecard` | `#8b5cf6` |
| `/medic` | `medic` | `FaHeartbeat` | `#ef4444` |
| `/overhaul` | `overhaul` | `LuGauge` | `#f97316` |

`stroked` is on each row because Lucide draws with a stroke and the other packs
with a fill, so the colour goes to a different attribute — a filled glyph handed
a stroke colour is a black shape on a dark stage. Verified on the render at
f1625, which is `GiOvermind`, the fill branch.

### Verified on the render

- **Every cut is on a bar line.** `scdet` puts them on bars 2, 3, 4, 7, 9, 10,
  11, 12, 13, 14, 15, 16, the drop at 18, then 25 and 28 — all within a frame.
- **f805 is not an edit.** It is the view switch *inside*
  `midnite-studio-browser.mov` that every cut since v1 has flagged at f856; the
  browser claim moved a bar earlier this round, so its own artefact moved with
  it.
- **The loops movement adds no cut.** Six cards inside one continuous recording,
  and `scdet` finds nothing between bars 21 and 25 — which is the check that they
  read as cards arriving rather than as the picture being replaced.
- **The loop still closes** at 48.1dB, for the reason given above.
- **The caret is aligned**: 510–576 against a 512–574 cap, re-measured on the
  render rather than on the preview.

Outstanding: three recordings (Agentic kanban, Multi-screen, Video Editor) and
sign-off on the 88.0s runtime.

**The "Ideate" / "Concepts" question is closed**, open since v1: the client
confirmed `/concepts` is the app's `innovate` loop, so the product's name was
right and the brief's was a working one. It is not a string in this repo any
more — the generator reads it from the app.

## v4-edits — the client's fourth round

`output/v4-edits.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 27.8MB.
**Three beats are still title cards** (Agentic kanban, Multi-screen, Video
Editor), so this is still a rough cut until they land.

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v4)* section,
planned in [`../EDITORIAL_SCRIPT.md`](../EDITORIAL_SCRIPT.md) §9.

### The mark is centred, and it was 75px out

The client's note was that the logo "is not vertically centred when it is in the
centre… only slightly off, but noticeable". Measured on stills at f10 and f2630
— the mark alone on black at both ends of the film — the crescent's ink ran
y385–545, a centre of **465 against the stage's 540**. Not a lean: 7% of the
picture.

It was deliberate. `MARK.open` carried an argument that a block centred on the
geometric middle of a 16:9 frame reads as low, and 462 was chosen to answer it.
That reading is overruled and the comment now says so rather than quietly
contradicting the code.

The station is **537, not 540**, and the three pixels are the interesting part:
the crescent's artwork is not centred in its own box — 7px of padding above the
ink and 1px below — so a box centred on 540 puts the *ink* three pixels low.
What is written down is the ratio rather than the three pixels, because the
padding scales with the mark and there is now a second centred station at 230px
that needs 4.1. Re-measured on the render: **ink centre y = 540.5**.

`MARK.close` is `MARK.open`, so both ends of the film moved together and the
loop still closes — frame 2639 against frame 0 at **PSNR 50.4dB**, the same as
v3.

### The intro has no prompt

The `>_` is gone. The clip it unfurled out of was sized at 200px for a glyph and
a caret and now only ever reveals the caret, so it is 48 — one character cell at
this size. `PROMPT_IN`/`PROMPT_OUT` are untouched, which matters more than it
looks: the row still *collapses* back to the bare mark before bar 0 rather than
being cut away by it, and that collapse is what hands the mark to
`TravellingMark` at exactly `MARK.open`. Removing the glyph could easily have
been done by deleting the animation with it.

### The statement is a lockup, not a line with a logo near it

"Replace no one" and "Empower everyone!" now have the mark standing to their
left. The plan called for one fixed station for both, and the two lines are
813px and 1050px of ink — 237px apart — so one station means one of them gets a
32px gap and the other 153. That was rejected: what is fixed here is the **gap**
and the **pair's centring**, not either object's position, so the mark has a
station per line and the type carries one width-independent shift.

The gap is **96px, and it is measured against the ring rather than the
crescent**. The first render used 32, derived from the mark's 124px box, and a
still at f1040 had `MarkWaveform`'s spokes lying across the "E" of "Empower":
the ring stands a full mark-height off centre, so the lit object is 248px wide
where the box is 124. A gap sized to the box is half a gap. 96 is 62 to clear
the ring plus the 34 the intro already uses between its own mark and the line
beside it — the same pairing of the same two objects, so not a fresh number.

### The strip-back before the drop is the film's biggest new effect

Frames 1281–1383 were bare light paper for 3.4 seconds under a track emptying
out. Now the mark comes back to the literal centre of the stage, grows to 230px,
and `Crescendo` gathers a field of brand-ramp motes and radial smoke that
implodes onto it and blows apart on the drop.

Three things were wrong in the first working version, and all three are the kind
that only a rendered frame shows:

- **It was pitched for a dark stage.** This stretch is on 99%-lightness paper
  until the drop flips it, and a blurred disc is a *lightening* operation on
  near-black and a *darkening* one on white — not equally strong, because
  `LIGHT.RAINBOW` is only as dark as it had to be to clear 4.5:1 and so starts
  much closer to the page. At one figure for both stages the compression read as
  four faint specks. The field now carries `1 + mix * 0.7`, the same correction
  its colour already made, applied to its weight.
- **The mark and the field converged on different points.** The mark's journey
  ran to the drop on an ease-in, so at f1360 it was two thirds of the way home
  while the smoke was already tight around a centre it had not reached. The
  journey now lands on **`BUILD.implode` (bar 17)** and both sides read that one
  beat out of `beats.ts` — a field that implodes *onto the logo* cannot be timed
  independently of the logo.
- **The implosion collapsed to 46px, inside a 230px logo.** At the tightest
  frame — f1378, the one the whole build exists for — there was nothing on
  screen at all: the entire field was hidden behind the thing it was closing on.
  It now bottoms out at 190px, a ring tightening *around* the mark until it is
  riding the outside of its glow.

The theme flip and the shimmer the brief asks for at the drop already existed
(`wipe-harness`, plus the f1383 streak at intensity 0.6); the explosion was
timed to land with them rather than duplicating them. `thumpAt`/`punchAt` are
under 0.01 from f1338 to f1382 — the track really is silent there — so the
compression rides one authored curve and the burst hands straight back to the
measured envelope, which puts its brightest instant a few frames *into* the
explosion where the sub-bass actually lands.

### "connect with"

`monoFontFamily` at 34px with 0.3em tracking and `textTransform: uppercase`
became `uiFontFamily` at 30/500 with 0.08em and the literal lower-case string.
It is the titles' own face now, as asked. `FG.muted` is unchanged — v1 recorded
what `subtle` did to this line.

### Verified on the render

- **The loop closes.** Frame 2639 against frame 0 at **PSNR 50.4dB**, unchanged
  from v3, which is what says moving both ends together did not open a seam.
- **The cuts are still on the grid.** `scdet` finds the same picture changes as
  v3 and every one lands on a bar line — 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15,
  16, the drop at 18, then 25 and 28. f856 is the familiar view switch *inside*
  `midnite-studio-browser.mov`, not an edit.
- **The crescendo adds no cut.** The drop at f1383 is detected and nothing in
  the 102 frames before it is, which is the check that the gather and implosion
  read as continuous motion rather than as things appearing.
- **The centring is measured, not assumed.** Ink centre y = 540.5 against a
  stage centre of 540, where v3 was 465.

Outstanding, unchanged from v3: three recordings, the "Ideate" / "Concepts"
decision, and sign-off on the 88.0s runtime. New this round: §9.6 of the
editorial script flags that the client called a 75px offset "slight", which is
worth confirming was the thing they meant.

## v3-edits — the client's third round

`output/v3-edits.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 27.2MB.
**Three beats are still title cards** (Agentic kanban, Multi-screen, Video
Editor — 5.1s of the 88), so this is still a rough cut until they land.

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v3)* section.

### The titles are titles now

They were captions in JetBrains Mono at 44px, which is right for the intro —
that act *is* a terminal — and wrong from bar 0, where the film is a product
page. `TypedTitle` sets them in the UI face at 50px and puts the brand ramp
behind them, blurred off a thick text stroke: two `Typewriter`s at the same
moment of the same typing, sharing one box, the glow one drawing no caret
(`caret="none"`).

**They were also 8.5px out of line with the logo beside them**, which is what the
brief noticed. `line-height` centres the font's *content* box — ascent plus
descent — and the cap box is not centred inside that; how far off depends
entirely on the face, and Poppins' metrics are lopsided enough to put the caps
well below a mark centred in the same line. Measured off rendered stills at f640
and f1460:

| | top | bottom | centre |
|---|---|---|---|
| mark | 70 | 119 | 94.5 |
| title cap box | 89 | 117 | 103.0 |

Identical in both themes, which is what said it was the layout and not the
content. `CaptionLine` now carries the correction, the measurement that produced
it, and the box itself — three scenes were drawing that line from three copies of
the same styles, and a fourth thing has to agree with them that is in none of
them: the travelling lockup standing at its head.

### Every caret is the intro's

Thin, in the ramp, and the right height. Four places still drew the block glyph —
the tour's titles, the harness headings, the harness list items and the qualifier
after "Studio" — and the bar itself was wrong anyway: it ran from 0.76em above
the baseline to 0.12em below, a quarter taller than the capitals beside it and
hanging six pixels under the line at title size. It is now 0.73em above the
baseline and 0.04em below, which is within three hundredths of the cap height of
*both* faces this repo sets — Poppins at 0.70em and JetBrains Mono at 0.73em — so
one pair of numbers is right for a page title and for a terminal prompt.

### The logo is a speaker with a spectrum on it

`make-track-envelope.mjs` now bakes **eight octave-wide bands** (55Hz–7040Hz)
alongside `THUMP` and `PUNCH`, and `MarkWaveform` stands 72 spokes off the
crescent's edge inside its glow, each as long as one band is loud on this frame,
with sixteen motes riding them.

Two decisions worth keeping:

- **Each band is normalised against itself.** A mix is some thirty decibels
  louder at 110Hz than at 7kHz, so bands scaled against a common maximum give a
  ring where two spokes swing the full radius and the other six are a flat stub.
- **The ring is mirrored**, bass at twelve o'clock. Wrapping the bands once
  around instead puts the loudest next to the quietest at the seam, and a ring
  with a notch in it reads as broken rather than as asymmetric.

The cone is driven harder — 14% against 7% — and **not cleanly**. `punch` flexes
the mark (`sx` and `sy` pushed in opposite directions by the same jitter), rocks
it a couple of degrees and throws it a few pixels in both axes, all four from
`hash(frame + k)` at different offsets so they are uncorrelated with each other
and with the beat. That is the difference between "chaotic" and "shaking in
time"; the latter reads as the whole frame being unstable rather than as the logo
being hit.

The mark also grew — 150 → 168px at both ends of the film — and gained a fifth
station: **180px, centred, over "Connect with"**, where the cone is driven half
again as hard on top of the size. That beat is the only one in the film where the
logo is alone on the stage with the music underneath it; the intro has no bass to
speak of and the close is a wind-down. The outro's eyebrow, forge row and call to
action are now laid out downwards from that station rather than from measured
tops.

### The cards are struck onto the stage

70% to 100% over seven frames, eased out hard, sliding a twentieth of their own
size from one edge, with a shake on top — and behind each one a blurred conic
sweep of the theme's ramp at the card's own corner radius, turning and breathing
on `thump`.

Three things about that:

- **The shake is `PUNCH`, not `THUMP`,** decayed over fourteen frames. Driven
  from the cone's displacement a card trembles for its whole shot; driven from
  the strike it is struck and then holds still.
- **The halo cannot be a `box-shadow`,** because CSS gives a shadow one colour
  and this one rotates. It is an element under the card.
- **The directions are not random.** The tour cycles all four edges, because its
  window is centred and four cuts all rising from the bottom read as one object
  being replaced. The harness panels always come from the right, because they sit
  against the right margin.

The slow push-in on the tour's cards went with this. It existed because these
recordings hold still for seconds and a rigid card reads as a screenshot; the
halo now does that job without slowly changing the composition.

### The stage turns over eight times

Three wipes became eight, all on bar lines with a measured onset under them, and
strictly alternating direction:

| bar | 0 | 4 | 8 | 10 | 11 | 18 | 25 | 28 |
|---|---|---|---|---|---|---|---|---|
| to | light | dark | light | dark | light | dark | light | dark |
| dir | → | ← | → | ← | → | ← | → | ← |

Bar 8 is the track's own section change. **Two places deliberately do not flip**:
the loops movement stays dark because its six flashes are Tailwind 500 swatches
and cyan-500 on 99%-lightness paper is 2.6:1 — the colour is the point of that
beat — and the outro stays dark from bar 28 because the last thing the film does
is land on black.

Everything that stands on the stage already asked the wipes what colour to be
(`themeMixAt`, added in v2), so five new stage changes cost no new hand-timing.
What did need fixing is the harness bloom: it is drawn *above* every wipe, since
from the drop on the stage keeps turning over and a bloom buried in the stack
would be covered by the first flip and never come back. Being on top, it has to
be told when not to draw — a violet wash on 99%-lightness paper is not
atmosphere, it is a colour cast.

### And the rest

- **The agent cascade lights in eleven different colours.** A band crosses each
  mark as it arrives, masked to the glyph and tinted with that agent's accent.
  Eleven marks flashing the same violet is eleven marks flashing violet; eleven
  each flashing their own brand is a roster, which is the claim the beat makes.
  The accents reach the renderer through `shared/agentAccents.ts`, which
  `make-logo-cuts.mjs` generates from the same table it cuts the `-color` files
  with — copying them by hand would have been two lists to keep in step, and the
  one that drifted would drift silently.
- **The forge reveals are hit and lit.** Mark and name shake together on one
  wrapper — separately they read as two objects that happen to be vibrating — and
  the name carries `ShimmerLine`'s new `band="brand"`, which puts the ramp across
  the letterforms' *stroke* rather than a white highlight over them. The mark
  beside it is a vendor's colour, so the type is the only midnite-coloured thing
  in the frame.
- **"Don't replace anyone" is "Replace no one".** Read out of the v3 note's
  parenthetical, which gives the new pair and then the old one; flagged in the
  brief in case it meant something else.

### Verified on the render

- **The cuts are on the grid.** `scdet` finds eleven picture changes and **ten
  land on a bar line to the frame** (bars 2, 3, 4, 9, 10, 12, 13, 15, 16 and the
  drop). The eleventh, f856, is the same view switch *inside*
  `midnite-studio-browser.mov` that v1 and v2 both flagged — it sits sixteen
  frames before the genuine cut at f872 and is not an edit.
- **The loop still closes.** Frame 2639 against frame 0 at **PSNR 50.4dB**. Lower
  than v2's 54dB and for a knowable reason: the mark now carries a spectrum ring
  whose spokes differ by one frame's worth of music across the wrap, where before
  there was only a smooth glow to match.
- **The titles are aligned.** Re-measured on the render, the same way the offset
  was found: **+0.5px on the light stage, 0.0px on the dark one**, against +8.5px
  before. And the caret is 37px tall against a 35px cap — within two pixels of
  the type beside it, where it used to run a quarter taller and hang below the
  baseline.
- **The caret does not jump.** Frames 617–624 across the "Manage multiple git
  repos" cut show it holding one y through the 0 → 1 character transition, which
  is the specific bug the brief named.
- **Audio lands where the grid says.** Last onset cluster 77.20 / 78.70 / 79.40 /
  79.80s, under the lockup beat at 80.13s; audible content ends 87.60s against a
  picture that is the bare mark from 87.2s.

> **A correction to the v2 entry below.** It claims a 0.02s envelope shows
> "separate strike transients rather than a wash". Re-measured at 0.01s, that is
> only true of the *slow* lines. The keyclick one-shot is 0.11s long and the
> intro's fast lines type at 1.2 characters a frame — a strike every 33ms — so
> three clicks overlap at any moment and the envelope is a continuous plateau.
> "Harness the beast" at 0.62 does ripple at its own 54ms period.
>
> Nothing changed as a result, because a continuous keyboard texture at 0.15
> under a full mix is what the brief's "subtle" asked for. But the earlier claim
> was measured at a window too coarse to have shown what it said it showed, and
> the same sentence would have been written again next round.

## v2-edits — the client's second round

`output/v2-edits.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 27.2MB,
rendered in ~6 minutes. **Three beats are still title cards** (Agentic kanban,
Multi-screen, Video Editor — 5.1s of the 88, down from 15.3), so this is still a
rough cut until they land.

Everything in [`../input/BRIEF.md`](../input/BRIEF.md)'s *Edits (v2)* section,
plus the six recordings supplied with it.

### The film is now a loop

Frame 0 and frame 2639 are the same picture: the crescent, centred on pure black,
its glow breathing. **PSNR 54dB between them**, which is the same image. Playing
the file twice in a row has no seam in it.

That turned out to be the structural change rather than a flourish, and three
things had to move for it:

- **`MARK.close` is now `MARK.open`**, the same object rather than two sets of
  numbers that agree today. It was 160px at y=494 against the opening station's
  150px at y=462 — six pixels bigger and thirty-two lower, which on a loop is a
  jump on the cut that reads as a dropped frame.
- **There is no composition-wide fade to black any more.** A `Blackout` layer
  takes the stage to true black from the collapse and the mark is drawn above it,
  so the last thing to leave is "Coming Soon" and what is left is what the film
  opened on. The first attempt simply forgot the layer, and the last frame kept
  the harness bloom — a purple haze the first frame does not have.
- **`MidniteWordmark` gained `auraLoop`.** The glow breathes on two slow sines
  and its ramp turns at a fixed rate, none of which had anything to do with the
  film's length, so the last frame caught the breath near its peak while frame 0
  had it at its trough. Given a length, each period is nudged to the nearest one
  that divides it a whole number of times — 71 frames becomes 71.35, under one
  percent, invisible.

### The mark, all the way through

It is now on screen from the first frame to the last. The intro owns it while
the row it is centred in belongs to that act and hands over at bar 0 — exactly,
because by then the prompt has folded away and the row *is* the mark, centred,
which is `MARK.open`.

It also became a sub-woofer. `scripts/make-track-envelope.mjs` bakes the track's
low end into `energy.ts`, two numbers a frame: `THUMP` (the cone — RMS under
140Hz with an instant attack and a 0.86 release) and `PUNCH` (the strike — how
far above its own trailing average the bass is). The release is what makes it
work: this track's low end is almost entirely transient and the raw envelope is
zero between kicks, so a logo scaled by it flicks for one frame and sits still
for fifteen.

The glow is a conic sweep of the theme's ramp — conic rather than linear because
a linear ramp behind a round mark has a light side and a dark side and reads as a
lit object, where a conic one has the whole ramp at every radius and reads as the
mark *emitting*. Everything scales with `size`, so at the 46px caption station
the swell is a fraction of a pixel rather than a tic.

### The theme crossfade is computed now, not timed

The old version was four hand-written interpolations, timed by reading
`LiquidWipe`'s geometry and inverting its easing on paper. Two of the four were
wrong in the first render and there are two more wipes in this cut.

`wipeCoverage` in `LiquidWipe` answers the only question that matters — how much
of the incoming stage has reached a given column on a given frame — and
`themeMixAt` in the new `wipes.ts` applies each wipe's answer on top of the last.
It cannot drift from the picture because it *is* the picture's arithmetic.

The same function then fixed two bugs nobody had looked for, both the identical
failure for the identical reason:

- **The harness heading was white on white for four frames.** The drop's wipe
  travels right-to-left and reaches the list column eight frames in, so
  "Embedded skills" starts typing while the stage under it is still the
  build-up's paper. A still at f1386 showed "E" and "El" as ghosts.
- **"Empower everyone!" was near-black on near-black for four frames**, and
  "Don't replace anyone" was white on white. Each statement lands on the frame
  its own wipe *starts*, so for a moment it is standing on the stage it is
  leaving.

### What else changed

- **Stage 1 is five lines, not eleven** — the brief's own rewrite. It opens on
  the mark alone, the `>_` prompt unfurls *out of* the mark (the same clip-width
  idiom the name uses), the caret is a thin ramp-filled rule rather than a block
  glyph, and the last line is unpicked so the act ends on the mark alone. The
  terminal icon lost its box.
- **The caret alignment bug is fixed, and it was a real CSS rule.** On the frames
  where nothing was typed, the line's only content was the out-of-flow caret —
  and CSS treats a line box containing no text and no inline with margins,
  padding or borders as **zero-height**, so in a row centred with
  `align-items: center` the caret dropped by half the face. `Typewriter` now
  carries a zero-advance inline-block holding a space.
- **Stage 2 gained "Agentic kanban"**, which cost a bar. It came out of the
  build-up — every other candidate cost more — so stage 3 starts at bar 10 and
  the music's section change at bar 8 lands on a claim cut rather than on a stage
  boundary. That is the one place in the cut where the picture and the
  arrangement are not saying the same thing.
- **Stage 3 is two stages.** "Don't replace anyone" on near-black and "Empower
  everyone!" on white, a bar apart, with a liquid wipe under each — so the film
  now has four wipes, alternating direction, entering each theme from both sides.
- **Every shimmer is smoke.** `SmokeStreak` runs the same `feTurbulence` →
  `feDisplacementMap` pair `LiquidWipe` uses, on a raking band rather than a
  panel. `SwooshStreak` is still in `shared/` and nothing in this film uses it.
- **The harness bullets are round dots in the type's own ink, and the items are
  typed.** The dash-shaped ramp rule read as punctuation — twelve sentences with
  their first word missing. Typing the items reverses the first cut's call, and
  the brief is right: a list that *appears* reads as a slide, a list being typed
  reads as the harness being configured while you watch. It does not rattle
  because the level is 0.72× the headings' and `TypingSound` caps the clicks at
  one a frame.
- **The forge row cascades.** A band of light crosses each mark in turn, thirteen
  frames each, on the eighths of bar 36 — the treble between the kicks. Clipped
  to the mark by a CSS mask of the same SVG, so what lights up is the octocat and
  not a rectangle passing over it, **plus** a bloom around each mark as the band
  crosses its middle: GitHub's is drawn flat white here, and a white band clipped
  to white ink does nothing at all.
- **The close runs the open backwards.** "Studio" is unpicked at the speed it was
  typed — not `Typewriter`'s 2.2× backspace, because this is the lockup being
  taken apart deliberately rather than a line being corrected — then the name
  folds into the mark, then the stage goes black, then "Coming Soon".

### Assets

- **Aider's mark was replaced with self-coloured bit-art**, and the cut made from
  the *previous* mark was still on disk and still the file the roster loaded. The
  roster drew a logo the brand had stopped using and every check passed.
  `make-logo-cuts.mjs` now fails on a cut nothing generates, and
  `sync-assets.mjs --prune` removes the copy in `public/`.
- **Grok gained an ink cut.** Its accent in the roster is white, because its
  brand is black-or-white and black is invisible on midnite's page — and stage 2
  deals the whole roster onto *white* paper, where a still at f563 was a blank
  frame under a caption. `AgentLogo` gained `tone="ink"`, which is `color` for
  every other agent.
- **Five agent marks now derive their cuts without configuration.** Claude,
  Cursor, Codex, Copilot and Cline ship painted in exactly the hue the roster
  already records as their accent, so `make-logo-cuts.mjs` finds the token rather
  than being told it — which keeps the roster the only place an agent's colour is
  written down. Their `-color` and `-white` cuts had been sitting outside the
  generator entirely.
- **`midnite-github-integration.mov` was playing through a view switch.** From
  3.90s the shot caught the tail of the project board and then the cut into the
  runs pane, which on this recording is three frames of a completely black
  window. 4.30s looked settled on a 10fps sheet and was not — the pane deals its
  rows in over the two frames after it, which a still at the cut showed as an
  empty shell. Now 4.47s at 0.88×.

### Cost, and how it was checked

~6 minutes for the full render, up from 4.5 — the difference is the ~25
`SmokeStreak`s, which are the same per-pixel Perlin evaluation a wipe runs. They
are affordable because of the *mount*: a streak exists only inside its own short
`<Sequence>`, where a wipe is mounted for the whole film.

Most of this was caught on **scaled proof renders** rather than on stills: at
`--scale=0.35` the whole 88 seconds renders in one minute, and a 1fps contact
sheet of that is enough to find a wrong shot, an unreadable line or a missing
layer. Only the four theme crossfades and the loop seam needed full-size frames.

Verified on the render itself:

- **The cuts are on the grid.** `scdet` finds nine hard picture changes; eight sit
  on bar lines (2, 8, 10, 12, 13, 15, 16, 18). The ninth (f856) is a view switch
  *inside* the browser recording, not an edit.
- **The loop closes.** Frame 2639 against frame 0, PSNR 54dB.
- **The keyboard is audible** from f106, which is where line 1 starts. *(This
  entry originally said "and discrete"; a finer measurement in v3 shows the fast
  lines overlap into a continuous texture — see the correction in that entry.)*
- **All four theme crossfades were read off cropped full-size stills** either side
  of each crossing. The mark is never invisible.

Outstanding, all in the editorial script's checklist: three recordings, the
"Ideate" / "Concepts" decision, the graph-builder repeat, and sign-off on the
88.0s runtime.

---

## v1-first-cut — the first full render

The composition as described by [`../EDITORIAL_SCRIPT.md`](../EDITORIAL_SCRIPT.md):
88.0s, five acts, every cut on a measured bar of `The_Iron_Aria`.

`output/v1-first-cut.mp4` — 88.06s, 1920×1080, h264 + 48kHz stereo AAC, 25.7MB, rendered in 4.5 minutes.
**The six pending recordings are still title cards**, so this is a rough cut
until they land.

Verified on the render itself rather than on the preview:

- **The cuts are on the grid.** `scdet` finds five hard picture changes; four sit
  on bar lines 2, 7, 8 and 9 within half a frame. The fifth (f805) is a view
  switch *inside* the browser recording, not an edit.
- **The audio lands where the grid says.** The rendered track's last onset
  cluster is 79.4–79.8s, immediately under the lockup beat at 80.13s, and audible
  content ends at 87.60s against a picture that is black by 87.93s — so the image
  lands on black as the music lands on silence, not the other way round.
- **The keyboard is audible and discrete.** A 0.02s envelope over the intro shows
  separate strike transients rather than a wash.

**Render cost, and the bug it exposed.** The first full attempt sat at 0.85
frames/second and was *still* at roughly that through frames 872–1536 — a stretch
with no video in it at all. That ruled out `OffthreadVideo` and pointed at the
three `LiquidWipe`s, which stay mounted for the whole film by design and were
running `feTurbulence` plus two `feDisplacementMap`s over a 2.1-megapixel stage,
every frame, to redraw a picture that had stopped changing the moment each wipe
landed.

`LiquidWipe` now short-circuits both ends — nothing at `progress ≤ 0`, a flat
fill at `progress ≥ 1` — and both are output-identical rather than
approximations (the landed panel's opaque region overhangs the frame by the
displacement scale, so there is nothing for the filter to change inside it). The
build-up's bloom and motes are dropped once the harness wipe covers them, for the
same reason.

Measured after: **200 frames of the placeholder stretch in ~18s of frame loop,
≈10fps**, against under 1.4 before. Frame 900 re-rendered at MSE 0.00 /
PSNR 81.5dB against the pre-fix render, which is the identity check.

The ~200 keystroke mounts turned out not to be the problem. If a render ever does
need to be cheaper, `TypingSound`'s schedule is one `<Sequence>` per click and
thinning it is a one-line change.

What the stills caught and what changed because of them:

- **"Watch your swarm" was a terminal.** The commit graph is on screen from 2.75s
  to 3.65s of a 5.19s recording — 0.9s — and the shot was cut at 1× from 2.93s,
  so it played past the graph into the terminal that follows. Now 0.40× from
  3.00s. Found on a still at frame 700; a 2fps contact sheet had suggested the
  graph ran from 3s to 4.5s, and it does not.
- **The lockup went white-on-white, then ink-on-black.** Both wipes, both
  directions, same root cause: the theme crossfade was pinned to a round fraction
  of the wipe instead of to where the smoke band actually crosses the mark, and
  `bezier(0.22, 0.6, 0.2, 1)` is 91% done at its halfway frame. At bar 0 the mark
  is centred and the paper is under it by frame 8 of 46 — a switch at 20 left a
  white crescent on white for a quarter of a second. At bar 9 the mark has moved
  to the caption station and the mirrored wipe reaches it by frame 17 — a switch
  at 34 left an ink crescent on near-black for 0.6s. Now `product+7…13` and
  `build+15…21`, both verified on cropped stills either side of the crossing.
- **The finished wipe left pale smears down the right-hand edge** — for the rest
  of the act, not just during the transition. `feDisplacementMap` drags
  transparency inward when the opaque region ends at the frame's edge; the panel
  now lands 190px (the displacement scale) past it.
- **"Studio" popped on the film's biggest beat.** The qualifier held its full
  length from the boom at bar 38 until the retype started 16 frames later, so the
  finished word showed, blanked, and typed itself again. The reset is now on the
  boom.
- **The harness list wrapped five of its twelve lines** at 46px in a 560px
  column. Items are 40px; two lines still wrap, both long enough that it reads as
  typeset.
- **"Connect with" was a watermark** at `FG.subtle` on near-black in the track's
  quietest two bars. Now `FG.muted`.

Outstanding, all listed in the editorial script's checklist: six recordings, the
"Ideate" / "Concepts" decision, and sign-off on the 88.0s runtime.
