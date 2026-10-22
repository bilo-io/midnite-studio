# Editorial script — Midnite video 1: the automated workflow

Project id `youtube-tutorials/midnite-video-1-automated-workflow` · 1920×1080 · 30 fps ·
two cuts of one picture (v4 onwards), each with an `…Annotated` twin:

- `MidniteVideo1AutomatedWorkflow`: the bed, **232 beats at 124 BPM = 3368 frames = 1:52**.
- `MidniteVideo1AutomatedWorkflowIronAria`: the go-live promo's song, **75 bars at
  140.95 BPM = 3831 frames = 2:08**.

Built from the neon-HUD template
([`templates/youtube-tutorials/neon-hud`](../../../templates/youtube-tutorials/neon-hud/README.md))
up to v3, and from the enriched go-live template
([`templates/midnite/golive-promo`](../../../templates/midnite/golive-promo/README.md)) since v4.
The brief, with the v2 revision notes, is [`input/BRIEF.md`](input/BRIEF.md). The source
voice note's transcript is [`input/voice-note-transcript.md`](input/voice-note-transcript.md).

## Environment notes

- The editor is `video-editor/`. Preview: `cd video-editor && npm run dev -- --no-open`.
  Render: `node scripts/render.mjs youtube-tutorials/midnite-video-1-automated-workflow <label>`.
- **After every render, remux the audio 2048 samples earlier.** Remotion's AAC carries
  2048 samples (42.7 ms) of encoder priming with an audio edit list of `media_time 0`, so
  players play the music 1.3 frames behind the picture. The fix is lossless:
  `ffmpeg -i vN.mp4 -itsoffset -0.0426667 -i vN.mp4 -map 0:v -map 1:a -c copy -movflags +faststart out.mp4`,
  then move `out.mp4` over `vN.mp4`.
- The bed is **generated**. `node scripts/make-midnite-video-1-soundtrack.mjs --report`
  rebuilds `input/bed.wav` and prints its headroom scale. Re-run it after any change to
  its `MAP`, keep `BPM` there equal to `beats.ts`, and keep `content.ts`'s
  `musicVolume` divided by the printed scale.
- The voice-over is **generated** too. `node scripts/make-midnite-video-1-voiceover.mjs --report`
  speaks every `say` line with Kokoro's `am_onyx` (`--voice <id>` picks another), places
  each on its slot, and rebuilds `input/voiceover.wav`. Re-run it after any change to a
  `say` line or to the timeline. It uses the Midnite Studio repo's `kokoro-js` and the
  app's downloaded model, and works offline.
- The Iron Aria cut's music is **generated** as well:
  `node scripts/make-midnite-video-1-iron-aria.mjs --report` rebuilds `input/iron-aria.wav`.
  Its voice-over is `make-midnite-video-1-voiceover.mjs --cut ironAria`, which writes
  `input/voiceover-iron-aria.wav`. Both scripts read the cut's slots from `cuts.ts`.
- System ffmpeg is at `/opt/homebrew/bin/ffmpeg`. The measurements used librosa in a
  throwaway `uvx` environment; nothing extra is installed in the repo.

## Source ground truth

This is a from-scratch build with no source video. All copy is on screen, as a two-line
headline plus a `say` sentence, and since v3 each `say` sentence is also spoken: the
Kokoro `am_onyx` voice-over, locked to its slot (see **Sound**). The only source is the
music.

**The template's bed runs at 124.00 BPM, not 123.05.** 123.05 is a librosa tempo bin,
not a measurement, and on that grid this track drifts six frames off the kick by beat 64.
A comb fit of beat times to the percussive onset envelope finds exactly 124.00 BPM, with
the grid origin 62 ms into the file. Every 16-beat phrase from 0 to 208 then sits within
2 ms. The template's `beats.ts` still carries the drift.

**The source is mastered over full scale.** Decoded as float it peaks at **1.37**. v1
decoded it to 16-bit, which hard-clipped 95 transients. Since v2 the bed is decoded to
float and scaled ×0.6917 to peak at 0.95, and played back up by the same factor, so it
is exactly as loud as before and never clips.

| | Source `soulprodmusic-gym-energy-514739.mp3` | Episode `input/bed.wav` (v2) |
|---|---|---|
| Tempo | 124.00 BPM (beat = 0.48387 s = 14.516 frames) | same |
| Grid origin | 62 ms | sample 0 |
| Key | G minor | same |
| Peak | 1.37 (over full scale) | 0.95 |
| Length | 108.5 s, ~210 beats audible | 112.26 s, 232 beats |
| Sections (beats) | 0–32 pads · 32–96 drop A · 96–128 breakdown (riser from 124) · 128–192 drop B · 192–216 tail | see below |

## The bed, arranged (v2)

| Output beats | Frames | Source beats | What |
|---|---|---|---|
| 0–96 | 0–1394 | 0–96 | intro pads → drop A |
| 96–136 | 1394–1974 | 64–104 | drop A's second half again, running into the breakdown |
| 136–144 | 1974–2090 | 120–128 | breakdown's last bars + the track's riser |
| 144–208 | 2090–3019 | 128–192 | drop B |
| 208–232 | 3019–3368 | 192–216 | the track's own tail, faded over the last 4 beats |

There are two splices, at beats 96 and 136. Each sits on a 16-beat phrase line between
sections of matching loop phase, with a 12 ms equal-power crossfade. Every other join
continues the source as it plays.

**No dropouts.** v1 cut half-beat silences into the drop at beats 63.5 and 143.5. You
heard them at **~30 s and ~69 s** as the music breaking, and they measure as −75 dB holes.
v2 has none. The `DROPOUTS` mechanism stays in the script, empty.

Verified on `v2-longer.mp4` after the remux:

- 0 clipped samples; mix peak 0.97.
- No holes in the audio. The dips left (e.g. 29.65 s, 30.15 s, 30.6 s) are in the source
  mp3 itself and identical in v1.
- 22 of 29 eight-beat slots sit within 2 ms of the grid. The rest are slots with no kick
  to lock to: the intro pads (+4 ms), the riser (+8 ms) and the fading tail (+8/+14 ms).
- Each picture cut's darkest frame lands on its beat frame, except one at +1 and the
  outro at +5 (it fades up).

## Asset inventory

| Asset | Where | Referenced as |
|---|---|---|
| Bed (generated) | `projects/…/input/bed.wav` | `projectFile(PROJECT_ID)("bed.wav")` |
| Bed source | `assets/audio/music/soulprodmusic-gym-energy-514739.mp3` (shared) | read by the soundtrack script only |
| Whoosh (light) | `assets/audio/sfx/trading_nation-deep-strange-whoosh-183845.mp3` | `SfxSound kind="light"` |
| Whoosh (big) | `assets/audio/sfx/dragon-studio-futuristic-transition-390304.mp3` | `SfxSound kind="big"` |
| Riser | `assets/audio/sfx/soundreality-riser-wildfire-285209.mp3` | `<Riser>` in `Episode.tsx` (faded in) |
| Impact | `assets/audio/sfx/primalhousemusic-production-elements-impactor-e-188986.mp3` | `SfxSound kind="impact"` |
| Kit | `video-editor/src/shared/neon-hud/` | imported, unchanged |

## Timeline (v2; `say` lines as of v10)

Eight beats a slot. Every cut is on a beat, and chapter cards land on phrase starts
(32, 80, 144). Inside a slot the kit's order applies (diagram from beat 0, line A at 0.5,
line B at 2, dim at 2.25, pill at 2.75, fade from end−0.4), plus the **`say` line**: it
fades up at beat 3 and out from end−0.6.

| # | Beats | Time | Slot | `say` |
|---|---|---|---|---|
| 1 | 0 | 0:00 | TWO MONTHS / ZERO LINES | Two months and I typed not even one line of code — |
| 2 | 8 | 0:04 | OVER A / MILLION LINES | my laptop wrote over a million — ghostwriter workflow. |
| 3 | 16 | 0:08 | NOT / ANOTHER APP | The trick isn't the tool — it's the workflow around the tools: |
| 4 | 24 | 0:12 | A TOKEN / FACTORY | skills, loops, sub-agents — every token pays its dues. |
| 5 | 32 | 0:15 | **ch 01 · The skill loop** (drop A) | Every step is a skill... with a loop is quite chill. |
| 6 | 40 | 0:19 | IDEATE / INTERVIEWS ME | Ideation interviews me: what are we building next? |
| 7 | 48 | 0:23 | FOUR OPTIONS / PICK ONE | Multiple choice every time... you and I choose what's best. |
| 8 | 56 | 0:27 | THE PLAN / LIVES IN THE REPO | Then it writes the plan in markdown, right there in the repo — |
| 9 | 64 | 0:31 | REFINE / THE PLAN | refine sharpens every edge till a cheaper model runs the show. |
| 10 | 72 | 0:35 | CREATE / PICKS IT UP | Create picks it off the backlog, builds it — ready, set, go. |
| 11 | 80 | 0:39 | **ch 02 · The swarm** | One session's good. A swarm is better — top notch. |
| 12 | 88 | 0:43 | ONE / ORCHESTRATOR | my main session's the orchestrator — the only one I watch. |
| 13 | 96 | 0:46 | SUB-AGENTS / IN PARALLEL | It spawns the sub-agents, and they do the actual building — |
| 14 | 104 | 0:50 | RIGHT MODEL / PER TASK | clever models hold the fort, cheaper ones do the filling. |
| 15 | 112 | 0:54 | EVERY AGENT / OWN WORKTREE | Each one in its own git worktree, so nobody collides — |
| 16 | 120 | 0:58 | OTHER MODELS / REVIEW IT | then a different model, ideally, reviews each PR — no free rides. |
| 17 | 128 | 1:02 | EVERY APP IS / A TERMINAL (breakdown) | All these tools and apps? Just a front end for a terminal — |
| 18 | 136 | 1:06 | STRETCH / EVERY TOKEN (riser) | the whole point's to stretch my usage: that's the formula. |
| 19 | 144 | 1:10 | **ch 03 · Never lose work** (drop B) | Sessions die... the work... does not. |
| 20 | 152 | 1:14 | THE CATCH / CONTEXT FILLS UP | Long sessions' context window should eventually be released — |
| 21 | 160 | 1:17 | AUTO / COMPACT | so the orchestrator auto-compacts to give the session a relief. |
| 22 | 168 | 1:21 | ROTATE AT / HALF FULL | sub-agents cap at 500K tokens — fresh one's sent. |
| 23 | 176 | 1:25 | WRITE IT / DOWN | Every worktree keeps a scratchpad: what it's doing, and why. |
| 24 | 184 | 1:29 | CRASH? / NOTHING LOST | laptop dies of memory loss? I resume — no goodbye. |
| 25 | 192 | 1:33 | THE / WHOLE LOOP (recap) | Ideate, refine, create, review... with a swarm on the go: |
| 26 | 200 | 1:37 | AS LONG AS / THE USAGE LASTS | as long as there's work to do, the session's gonna flow. |
| — | 208–232 | 1:41–1:52 | outro: IT JUST / KEEPS GOING, over the tail | — |

The diagrams and tones are in `content.ts`, which is the source of truth for copy. Red is
used only for negation (ZERO LINES, NOT, struck cards).

**Sound.** The bed plays at 0.55 ÷ 0.6917 (the template's level, undoing the headroom
scale), with a 2-beat fade-in. A light whoosh at 0.18 marks each scene change and a big
one at 0.35 marks each chapter card, both peaking on the cut. The stock riser at 0.3
peaks on beat 144 with an 8-beat head, **faded in over its first half-beat**. In v1 it
entered as a hard 8.5 dB step, because trimmed that short it starts 3 s into its file.
The impact at 0.45 lands on beat 208, as the drop gives way to the tail.

**Voice (v3).**
- Each `say` line is spoken a quarter-beat after its slot's cut and ends a quarter-beat
  before the next cut. Lines that overrun are sped up, capped at 1.25×.
- Line 22 crosses the cut into slot 23 even at the cap, so line 23 starts 0.5 s late.
- The voice is levelled to −16 LUFS. The bed sits under it at `musicUnderVoice`, which
  is the template's 0.16 lifted by +5 dB, and comes back up to `musicVolume` over the
  outro's first two beats.

## v4 and v5: the go-live template, two songs

The words, slots and voice are v3's. The picture is rebuilt on the go-live template's
two stages, with the HUD kit worn in midnite's skin (`neon-hud/skin.ts` → `brandSkin`),
so every headline, diagram, pill and caption follows the page across a wipe.

**Stage** (`content.ts` → `stage`): dark open; a **long** wipe to light on chapter 1
(slot 5); dark on chapter 2 (slot 11); the statement slot 17 splits across a wipe to light
mid-slot; dark again on the drop into chapter 3 (slot 19); light for the last slot (26);
dark for the outro. Directions alternate.

**From the go-live kit:** slot 17 is now a two-half **statement** ("Every app is" /
"a terminal."); slot 25 is the **typed slugs** (`/ideate /refine /swarm /resume`, one per
beat); the last beats of the slot before one drop are the **breath** (slot 18 on the bed, slot 10 on the Iron Aria: the mark to
centre, motes pulled in); each drop gets the **shimmer across the stage**; the **mark**
sits in the top-left corner except where the picture draws it itself; the outro ends on
the **lockup**, "Midnite Studio" with "subscribe".

**v4 (bed)** keeps v3's timing exactly, with two fixes:
- "RAM" was spelt out letter by letter, so line 24 now says *memory* (and so does its caption).
- The riser into drop B (1:06–1:09) reached −19.7 LUFS over its last 1.5 s, level with
  the voice, while the ducked bed under it sat near −28. It now plays at 0.1 (was 0.3),
  about 10 dB under the voice.

**v5 (Iron Aria)** re-cuts the slots to the promo's track (`cuts.ts` → `ironAria`):
- Slots are two bars, or three where the line needs it; chapter 1 lands on the track's first
  hit (film bar 9), chapter 2 on its drop (27), the statement on its loudest onset (45),
  chapter 3 on the drop again (49), the outro on the last boom (69).
- The track is 98.9 s, so the splice script plays it from bar −9 to bar 40, then jumps
  back to the drop at bar 18 and plays to bar 44. The join is on a bar line, just where
  the track itself goes nearly silent before the drop.
- The voice is re-placed on the new slots: 25 of 26 lines fit their windows; line 18
  runs 0.06 s into its tail, still before the drop.
- The music sits at 0.355 under the voice (−13.9 LUFS raw, so 7 dB under the −16 voice,
  as on the bed) and at full level over the outro. There is no stock riser; the track
  builds into its own drops.

## v6 and v7: the rap, and the one mark

The same picture and both songs again — v6 on the bed, v7 on the Iron Aria — with two
changes.

**The voice-over is a rap.** Every fact of v5's lines is kept; they are rewritten as
rhymed couplets across slot pairs (code/low, tools/dues, next/test, repo/show/go,
notch/watch, building/drilling, collides/rides, terminal/formula, won't/cold,
percent/sent, why/goodbye, go/go), with a little wordplay where it costs no clarity:
the laptop as a *ghostwriter*, a loop that *runs the mill*, a smart model that *holds
the baton* over an orchestrator, a laptop that *dies of memory loss*, a session that's
*on the go*. Every line fits its slot on both cuts, none spilling.

**The mark is one persistent object, as in the go-live promo** (`Mark.tsx`). It replaces
the corner mark and the marks the breath, slugs and lockup drew for themselves:
- It stands left of the first character of whatever title is up — each HUD headline
  (at 124px beside a stacked one), each chapter title, each half of the statement, the
  slugs' caption line — and flies there in 10 frames on every cut.
- For the breath it is drawn to the centre at 250px over the breath's own length, and the
  motes implode onto it; for the end it flies to the centre and the name unfurls out of
  it into the lockup.
- It is a loudspeaker the whole way: cone (`thump`), strike (`punch`) and spectrum ring
  (`bands`) come from the cut's own music, baked per frame into `energy-bed.ts` and
  `energy-iron-aria.ts` by `scripts/make-track-envelope.mjs` (both cuts are jobs there),
  driven harder at the breath and over the outro as the promo does.

## v8 and v9: lyric edits and the closing swoosh

- Five lines reworded on review: "I typed not even 1 line of code", "The trick isn't
  the tool", "Every step is a skill... and a loop runs the mill", "Multiple choice every
  time, 4 options... choose what's best", "the session's gonna flow".
- An ellipsis is now a held beat: the voice-over script speaks the halves separately
  with 0.38 s of silence between them (`PAUSE`).
- On the bed, line 7 runs 0.3 s past its slot even at 1.25×, so line 8 starts 0.16 s late.
- The outro opens on the go-live promo's closing swoosh (`big` at 0.5) instead of the
  template's impact, a low hit with an 8 s tail that read as a loud, odd thud.

## v10 and v11: the loop, the verdicts and the counter

- **Lyrics.** Lines 1, 2, 5, 7, 14, 19, 20, 21 and 25 reworded on review (the table above).
  Line 19 holds two beats ("Sessions die... the work... does not"). Line 25 now names
  the loop's four skills, then "with a swarm on the go".
- **One logo, start to end, and the film loops.** The mark opens alone at the centre
  (`HOME` in `Mark.tsx`, 220 px). Slot 1's scene waits two beats (`delay`), then the mark
  flies to the title. After the lockup the name and "Studio" fold back in, the call to
  action goes, and the mark settles at `HOME`. With no fade at either end, the last
  frame is the first.
- **The verdicts (template-wide, `neon-hud/Visuals.tsx`).** A `cross` card is a red box
  with an X drawn corner to corner, which shakes and falls back. A `check` card is a
  green box with a tick. Either can stand alone, centred, or the two together, red on
  the left. Slot 1 is one red box ("lines typed by me"). Slots 3 and 9 are pairs.
- **`growth`.** Slot 2 counts to 1,000,000 along an exponential curve drawn under it,
  then gets "++".
- **`pie`.** Slot 21's context drains from 50% red to 0% green. "Compacts at 20–40%" is
  the pill, so the figure stays on screen.
- **The hub.** With a `pick`, the core hops across the nodes and back before it settles.
  The pick lights green ("✓ selected"); the rest fade, each in a status colour. With
  skill `icon`s (slot 4) the core switches each node on in turn, and its Lucide glyph
  draws in, in the brand ramp.
- **The slugs (template-wide, `golive/parts.tsx`).** Each skill is outlined in a
  drifting, blue-weighted ramp. `star` fills one in the whole ramp, drifting the other
  way. In slot 25, `/swarm` lands on the word: the voice-over script now writes each
  line's parts' frames to `voice-<cut>.ts`.
- **Timing.**
  - Bed: line 7 still runs 0.36 s long at 1.25×, so line 8 starts 0.22 s late.
  - Iron Aria: the recap got a third bar from the scratchpad slot (`ARIA_SLOT_BARS` …
    60, 62, 64, 67). Line 23 now runs 0.06 s into its tail; nothing starts late.

## Code layout

`video-editor/src/projects/youtube-tutorials/midnite-video-1-automated-workflow/`.
The imports stay `../../../shared/`, at the same depth as the template.

- `cuts.ts`: both cuts' clocks, slots, drops, breath, riser and audio levels. Plain data,
  because the voice-over script imports it.
- `beats.ts`: the bed's clock (`BPM = 124`, `ORIGIN = 0`); `FPS` for `register.tsx`.
- `content.ts`: the 26 slots (scene, chapter, statement or slugs, each with an optional
  `say`), the stage changes and the outro.
- `Episode.tsx`: `Episode({ cut })`, the sequencer on the go-live stage, the mark's
  stations, the soundtrack and annotations.
- `Mark.tsx`: the persistent, beat-driven mark and the title measurement it stands by.
- `energy-bed.ts`, `energy-iron-aria.ts`: generated — each cut's music envelope.
- `voice-bed.ts`, `voice-iron-aria.ts`: generated by the voice-over script — where each spoken part landed.
- `register.tsx`: four compositions (two cuts × annotated), and one line in `src/Root.tsx`.

## Open items

None blocking. To confirm on review:

- The bed is still a re-arrangement of the template's track. A new song would come from
  Media ▸ Audio (`MUSIC.md` has the brief).
- Two repo-wide fixes are pending, both outside this project: the template's
  `beats.ts` (123.05 → 124), and folding the AAC remux into `scripts/render.mjs`.

## Next steps

1. [x] v1: build, render, measure sync, remux.
2. [x] v2: longer (1:52) and more verbose (`say` lines, 26 slots); clipping, dropouts
       and riser entry fixed; render, remux, verify.
3. [x] v3: the Kokoro `am_onyx` voice-over.
4. [x] v4: the go-live template with the brand skin; "memory"; riser down to 0.1.
5. [x] v5: the same on the Iron Aria, re-cut to its bars.
6. [x] v6 / v7: the rap voice-over and the one persistent, beat-driven mark, on both songs.
7. [x] v8 / v9: lyric edits, held beats, the promo's closing swoosh.
8. [x] v10 / v11: lyric pass, the looping mark, verdict cards, counter, pie, scanning hub, skill slugs.
9. [ ] Review v10 and v11 in Media ▸ Video.
