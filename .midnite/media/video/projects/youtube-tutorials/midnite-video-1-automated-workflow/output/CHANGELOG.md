# Midnite video 1 — the automated workflow — render history

<!-- scripts/render.mjs appends a stub per render; fill in what changed. -->

## v1-first-cut — 2026-10-19

- First cut, built from the neon-HUD template and `EDITORIAL_SCRIPT.md`. It runs
  81.3s (168 beats at 124 BPM): a hook, three chapters, a two-scene breath and the outro.
- The bed is `input/bed.wav`, re-arranged from the template's track with
  `scripts/make-midnite-video-1-soundtrack.mjs`.
- Sync, measured on this file: every picture cut falls on its beat frame
  (the darkest frame of each fade-through-black, 0 frames off; the outro
  reads +5 only because it fades up), and the audio sits within 2ms of the
  124 BPM grid.
- **Remuxed after render.** Remotion's AAC carries 2048 samples of encoder priming
  with no edit list to skip them, so the music played 42.7ms (1.3 frames) late.
  Fixed losslessly by shifting only the audio:
  `ffmpeg -i v1.mp4 -itsoffset -0.0426667 -i v1.mp4 -map 0:v -map 1:a -c copy -movflags +faststart out.mp4`
  (the audio `elst` then reads media_time 2048). Repeat this after every render
  until `scripts/render.mjs` does it itself.

## v2-longer — 2026-10-19

- **Longer and more verbose**: 1:52 (232 beats) instead of 81s, with 26 slots
  instead of 18. There are five scenes a chapter, *sub-agents in parallel* and
  *other models review it* are new in the swarm chapter, and a two-slot recap
  closes it. Every slot carries a `say` sentence under the picture, from the voice
  note.
- **Music fixes** for the reported cracks at ~30s and ~69s:
  - Removed the two half-beat dropouts (v1 beats 63.5 and 143.5 = 30.7s and
    69.4s). They measured as −75 dB holes cut into the drop.
  - Removed clipping. The source peaks at 1.37 when decoded as float, and v1's 16-bit
    decode hard-clipped 95 transients, several of them between beats. The bed is now
    decoded as float, scaled ×0.6917 and played back up by the same factor.
  - Faded in the riser instead of letting it step in 8.5 dB at once.
- The bed is re-arranged for the length: drop A's second half plays twice, then the
  breakdown and riser, drop B, and the track's own tail as the outro.
- Verified on the file: 0 clipped samples, no audio holes, and picture cuts on their
  beat frames (one at +1, and the outro's fade-up at +5). The audio is within 2ms of
  the 124 BPM grid wherever there is a kick to measure.
- Remuxed after render to remove the 42.7ms AAC priming delay, as in v1.

## v3-voiceover — 2026-10-19

- **Spoken narration.** Every slot's `say` line is now voiced, with Kokoro-82M's
  `am_onyx` voice. It runs locally on the model the app's companion voice already
  downloaded, so nothing was installed and nothing was fetched. The track is
  `input/voiceover.wav`, built by `scripts/make-midnite-video-1-voiceover.mjs`
  (`--report` prints each line's placement and speed).
- **Locked to the cuts.** Each line starts a quarter-beat after its slot's cut and
  must end a quarter-beat before the next one. Lines that overrun are re-rendered
  faster, up to 1.25×. Twelve of the 26 needed it, mostly at 1.05–1.2×.
- **One line still runs long.** Line 22, "Sub-agents never pass 500K tokens…", is
  4.3 s even at 1.25× and crosses the cut into slot 23. Line 23 then starts 0.5 s
  late, so the two never overlap.
- The on-screen text is unchanged. Only the spoken text differs: "500K" is said as
  "five hundred K", and "PR" as "P R".
- **Mix.**
  - The voice is levelled to −16 LUFS (loudnorm, −1.5 dBTP).
  - The bed is ducked under it at the template's 0.16, lifted by +5 dB to match
    the louder voice, so it still sits about 6 dB below the voice. It stays there
    for the whole film rather than pumping between sentences.
  - The bed comes back up to full level over the outro's first two beats.
  - Measured on the file: −16.9 LUFS integrated (v2: −17.3), peak −1.6 dBFS, no
    clipping.
- Remuxed after render to remove the 42.7ms AAC priming delay, as in v1 and v2.

## v4-golive-brand — 2026-10-19

The same words, slots, voice and bed as v3, rebuilt on the go-live template.

- **Template.** `templates/midnite/golive-promo`, now enriched with the whole
  neon-HUD kit. The HUD wears midnite's skin (`brandSkin`): Poppins headlines,
  the brand ramp, less glow. Every scene follows the page across a wipe.
- **Two stages.** Dark open; a long wipe to light on chapter 1; dark on chapter 2;
  the statement split across a wipe to light; dark on the drop into chapter 3;
  light for slot 26; dark for the outro.
- **Go-live beats.** Slot 17 is a two-half statement ("Every app is" / "a terminal.").
  Slot 25 is the typed slugs. The end of slot 18 is the breath before drop B.
  Each drop gets the shimmer across the stage. The mark sits in the corner, and the
  outro ends on the "Midnite Studio" lockup with "subscribe".
- **"RAM" → "memory".** Kokoro spelt it out letter by letter. Line 24 and its
  caption now say "memory".
- **The riser into drop B (1:06–1:09) is quieter.** At 0.3 its last 1.5 s
  reached −19.7 LUFS, level with the voice. At 0.1 it is about −29, roughly
  10 dB under the voice, and still swells into the drop.
- Measured on the file: −16.9 LUFS integrated, peak −1.6 dBFS, 1:52.3.
- Remuxed after render (42.7 ms AAC priming).

## v5-iron-aria — 2026-10-19

v4's picture, re-cut to the go-live promo's song, `The_Iron_Aria` (140.95 BPM).

- **Re-cut to its bars** (`cuts.ts` → `ironAria`). Each slot is two bars, or three
  when the line needs it. Chapter 1 lands on the track's first hit, chapter 2 on its
  drop, the statement on its loudest onset, chapter 3 on the drop again, and the
  outro on the last boom.
- **Lengthened by a splice** (`scripts/make-midnite-video-1-iron-aria.mjs`). It plays
  the track from bar −9 to bar 40, then jumps back to the drop at bar 18 and plays to
  bar 44. The join is on a bar line, where the track itself goes nearly silent.
  2:07.7.
- **Voice re-placed** on the new slots (`--cut ironAria`). 25 of 26 lines fit their
  windows. Line 18 runs 0.06 s into its tail, but still finishes before the drop.
- **Mix.** The music sits at 0.355 under the voice, 7 dB below it as on the bed, and
  at full level over the outro. No stock riser, because the track builds into its
  own drops.
- Measured on the file: −17.0 LUFS integrated, peak −1.2 dBFS.
- Remuxed after render.

## v6-rap — 2026-10-19

v4 on the bed, with the voice-over rewritten as a rap and one persistent mark.

- **Lyrics.** Every fact is kept, recast as rhymed couplets across slot pairs, with
  light wordplay: the laptop as a ghostwriter, a loop that runs the mill, the smart
  model holding the baton, a laptop that dies of memory loss, a session on the go.
  The captions match the voice. All 26 lines fit their slots, with none spilling.
- **One mark** (`Mark.tsx`), as in the go-live promo.
  - It stands left of the first character of every title, and flies there on each cut.
  - At 124px it is bigger than v4's 46px corner mark.
  - For the breath it goes to the centre; for the end it unfurls into the lockup.
  - It pulses like a speaker to the bed's own bass envelope (`energy-bed.ts`): cone,
    strike and spectrum ring.
- Measured on the file: −16.8 LUFS integrated, peak −1.1 dBFS, 1:52.3. Remuxed.

## v7-rap-iron-aria — 2026-10-19

v6 on the Iron Aria cut: v5's slots and music, the rap voice-over re-placed on them.

- The mark is driven by the Iron Aria's envelope (`energy-iron-aria.ts`).
- All 26 lines fit their slots, with none spilling.
- Measured on the file: −17.0 LUFS integrated, peak −1.1 dBFS, 2:07.7. Remuxed.

## v8-rap-v2 — 2026-10-19

v6 with the review's lyric edits and a softer ending.

- **Lyrics.** "I typed not even 1 line of code"; "The trick isn't the tool"; "Every
  step is a skill... and a loop runs the mill"; "Multiple choice every time, 4
  options... choose what's best"; "the session's gonna flow".
- **Held beats.** An ellipsis is now 0.38 s of silence between the two halves of a
  line, spoken separately. Line 7 runs 0.3 s past its slot at 1.25×, so line 8
  starts 0.16 s late.
- **The ending.** The outro opens on the go-live promo's closing swoosh (`big`,
  0.5) instead of the template's impact. Over 1:40–1:44 the mix is −22.5 LUFS
  against v6's −20.1, with a peak of −7.5 dBFS against −5.1. The swoosh sits
  well under the voice.
- Measured on the file: −16.8 LUFS integrated, peak −1.1 dBFS. Remuxed.

## v9-rap-v2-iron-aria — 2026-10-19

v8 on the Iron Aria cut.

- The same lyric edits, held beats and closing swoosh. Every line fits its slot.
- Over 1:56.5–2:00 the mix is −17.7 LUFS against v7's −16.7.
- Measured on the file: −17.0 LUFS integrated, peak −1.1 dBFS. Remuxed.

## v10-rap-v3 — 2026-10-19

- Lyric pass: lines 1, 2, 5, 7, 14, 19, 20, 21 and 25 ("Two months and I typed not even one
  line of code", "ghostwriter workflow", "with a loop is quite chill", "you and I choose
  what's best", "clever models hold the fort, cheaper ones do the filling", "Sessions die...
  the work... does not", "context window should eventually be released", "to give the
  session a relief", "Ideate, refine, create, review... with a swarm on the go").
- Loops: the mark opens alone at the centre, flies to the first title after two beats, and
  after the lockup folds the name back in and settles at the centre again, with no fades.
- Red-cross / green-check verdict cards (template-wide): one red box for "lines typed by me";
  pairs on "not another app" and "refine".
- 1,000,000 counted up along an exponential curve, then "++"; the context pie drains from 50%
  red to 0% green.
- The hub scans its options before selecting one in green, the rest fading back in status
  colours. The skills hub switches each skill on in turn, each with its glyph in the brand ramp.
- The recap types /ideate, /refine, /create and /review outlined in a drifting blue ramp, then
  /swarm in the full ramp on the spoken word.
- Line 7 still runs 0.36 s long at 1.25×; line 8 starts 0.22 s late.
- 1:52.28 · −16.8 LUFS integrated · −1.1 dBFS true peak.

## v11-rap-v3-iron-aria — 2026-10-19

- Lyric pass: lines 1, 2, 5, 7, 14, 19, 20, 21 and 25 ("Two months and I typed not even one
  line of code", "ghostwriter workflow", "with a loop is quite chill", "you and I choose
  what's best", "clever models hold the fort, cheaper ones do the filling", "Sessions die...
  the work... does not", "context window should eventually be released", "to give the
  session a relief", "Ideate, refine, create, review... with a swarm on the go").
- Loops: the mark opens alone at the centre, flies to the first title after two beats, and
  after the lockup folds the name back in and settles at the centre again, with no fades.
- Red-cross / green-check verdict cards (template-wide): one red box for "lines typed by me";
  pairs on "not another app" and "refine".
- 1,000,000 counted up along an exponential curve, then "++"; the context pie drains from 50%
  red to 0% green.
- The hub scans its options before selecting one in green, the rest fading back in status
  colours. The skills hub switches each skill on in turn, each with its glyph in the brand ramp.
- The recap types /ideate, /refine, /create and /review outlined in a drifting blue ramp, then
  /swarm in the full ramp on the spoken word.
- Recap slot widened to three bars (the scratchpad slot gives one up); line 23 runs 0.06 s
  into its tail, nothing starts late.
- 2:07.70 · −17.0 LUFS integrated · −1.6 dBFS true peak.
