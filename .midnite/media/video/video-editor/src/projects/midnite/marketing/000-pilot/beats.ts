/**
 * The edit's beat grid — every frame number in this project traces back here.
 *
 * The soundtrack is no longer a stock file with an edit laid over it. It is
 * built by `scripts/make-pilot-soundtrack.mjs` out of the same 14-second sting,
 * arranged to 60 seconds, and *its* structure and this file's are one thing:
 * the script gates the bass out over bars 0–4, brings it in on bar 4, builds
 * from bar 16, drops on bar 19 and resolves on bar 29, and the numbers below
 * are those bars. Change a cut here and the music stops agreeing with it; the
 * script is where both live.
 *
 * ── The bar ─────────────────────────────────────────────────────────────────
 *
 * 74 536 samples at 44.1kHz = 1.690159s = **50.7048 frames**, 141.99 BPM. The
 * repeating unit is three of those, measured by autocorrelating the waveform
 * against a 1.5s window at 4.70s: r=0.88 at a 152.11-frame lag, against 0.69 at
 * one bar and 0.36 at four. v3 of this cut looped on four bars — a lag the
 * track barely resembles itself at — and got away with it because the join was
 * checked by onset positions rather than by similarity.
 *
 * The groove's first bass attack is at 4.6978s, frame 140.93, which is `bar(0)`.
 *
 * ── What is on each bar ─────────────────────────────────────────────────────
 *
 *    0   the groove enters under the roster; the bass is gated, irregular
 *    1   cut to the git graph
 *    4   cut to the agent terminal — and the bass stops being gated
 *    7   cut to the knowledge graph
 *   10.5 cut to the browser
 *   14.5 cut to the GitHub tour
 *   16   cut to the optimiser; the build-up starts under it
 *   19   the drop, on the cut to the AI companion
 *   20.5 cut to the loops panel, on the half bar, with a sub hit under it
 *   29   cut to the close; the drop resolves
 *   30   the track's own ending is spliced back in, and decays to silence
 */

/**
 * The built soundtrack, relative to this project's `input/`.
 *
 * A WAV rather than an MP3 because every cut below is a sample offset in it and
 * an MP3 round-trip adds encoder delay at the head. Rebuild it with
 * `node scripts/make-pilot-soundtrack.mjs`.
 */
export const TRACK = "soundtrack-60s.wav";

/** One bar, in frames. Everything in this file is counted in these. */
export const BAR = 50.7048;

/** Frame of the groove's first bass attack — bar zero. */
const GROOVE = 140.934;

/** Bar `b` of the groove, as a frame. */
export const bar = (b: number): number => Math.round(GROOVE + b * BAR);

/**
 * The beats the picture is cut on.
 *
 * `lockup` and `agents` are the sting's own two hits, unchanged since the first
 * scored cut; they are before the groove and so are not on the bar grid.
 */
export const BEAT = {
  /** First hit: the mark lands and the name unfurls out of it. */
  lockup: 39,
  /** Second hit: the agent roster sweeps in under the lockup. */
  agents: 102,

  /** One cut per feature, each on a bar. */
  slide1: bar(1), //  192  the git graph
  slide2: bar(4), //  344  the agent terminal — the bass turns regular here
  slide3: bar(7), //  496  the knowledge graph
  /*
    Two cuts land on the third beat of a bar rather than on a bar line. That is
    not a slip: the GitHub clip's first 1.7s is a loading skeleton, which leaves
    4.3s of usable picture, and two bars of screen time cannot be filled from it
    at any honest rate. Half a bar had to come off that slide, and the knowledge
    graph — the one clip with room to spare — absorbed it.
  */
  slide4: bar(10.5), // 673  the browser
  slide5: bar(14.5), // 876  the GitHub tour
  slide6: bar(16), // 952  the optimiser, under the build-up
  slide7: bar(19), // 1104 the AI companion, on the drop
  slide8: bar(20.5), // 1180 the loops panel, on the half bar inside the drop

  /** Cut to the close, as the drop resolves. */
  outro: bar(29), // 1611
} as const;

/** Where the build-up starts. The same frame as `slide6`, said the other way. */
export const BUILD = BEAT.slide6;
/** Where the drop lands. The same frame as `slide7`. */
export const DROP = BEAT.slide7;

/**
 * Where the picture starts fading to black.
 *
 * The track's own ending decays to silence at frame 1790, so the fade is over
 * before the file is — the last thing that happens is the picture landing on
 * black, not the sound cutting out under a lit frame.
 */
export const DECAY = 1775;

/** 60.0 seconds, which is what the soundtrack is built to. */
export const DURATION = 1800;
