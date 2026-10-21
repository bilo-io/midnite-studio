/**
 * The edit's beat grid — every frame number in this project traces back here.
 *
 * Unlike the pilot, the soundtrack is not built: `The_Iron_Aria` is a finished
 * 98.9-second piece with its own acts, and the brief's five stages are those
 * acts. So the arrangement is the fixed thing and the cut moves to meet it,
 * which is the opposite of the pilot and is why there is no
 * `make-…-soundtrack.mjs` beside this file.
 *
 * ── The bar ─────────────────────────────────────────────────────────────────
 *
 * **1.702694s = 51.0808 frames at 30fps, 140.95 BPM.** Fitted by least squares
 * over ten onsets that sit on a bar line, measured with a 600Hz onset-strength
 * envelope (half-wave-rectified two-sample RMS difference, peak-picked against
 * a local median). The anchor — bar 0 — is the track's first big hit at
 * **15.443s, frame 463.29**, and the fit is to 36 bars later at 76.740s, which
 * is the loudest onset in the whole piece.
 *
 * The residuals are the reassuring part: bars 6, 18, 32 and 36 land on measured
 * onsets within a frame (25.675 / 25.677, 46.092 / 46.096, 69.930 / 69.930,
 * 76.740 / 76.741), and so do bars −7, −5, −3 and −2 back in the quiet intro.
 * One grid runs the length of the track, so the intro's typing and the outro's
 * lockup are counted in the same unit.
 *
 * Worth knowing if you re-measure it: a plain autocorrelation of the whole
 * track's onset envelope does **not** find this. It peaks at 187 BPM (r=0.32)
 * with 174.5 and 163.5 close behind, because a cinematic piece with a
 * two-and-a-half-minute dynamic range is mostly quiet and the quiet parts are
 * not on the grid the loud parts are. The bar came out of reading the onset
 * *list* — five accents 0.855s apart at 39–43s — and then fitting, which is a
 * slower method and the one that worked.
 *
 * ── What is on each bar ─────────────────────────────────────────────────────
 *
 *   −9…0  the intro: sparse, almost silent. The mark alone on black, then five
 *         typed lines beside it, then the mark alone again.
 *    0    **the first hit** (0.61). The stage wipes to the light theme and the
 *         name unfurls out of the mark. Everything before this frame is a
 *         white crescent and white type.
 *    1…10 the eight product claims, a bar each — except the first, which gets
 *         two because it has an eleven-mark roster to deal.
 *    8    the music's own section change: the mix empties and turns rhythmic.
 *         It lands on the cut to "Knowledge graph" rather than on a stage
 *         boundary, which is the one place this cut pays for the bar that
 *         "Agentic kanban" took — see `CLAIM`.
 *   10…18 the build-up. Two bars of statement, four of features, two of
 *         nothing. Bars 13, 14 and 15 are three rising accents (0.09, 0.50,
 *         0.46) and three of the four feature names are cut to them.
 *   17.3  the track empties to near silence — the breath before the drop.
 *   18    **the drop** (0.59). Dark theme, and the harness section starts.
 *   18…31 the harness: four movements over thirteen bars. There is a strong
 *         onset on nearly every bar line here (18, 19, 20, 22, 23, 24, 26, 27,
 *         28, 30) which is what lets the copy land one line per bar.
 *   31    the drop resolves into a two-bar breakdown — the quietest the track
 *         has been since bar 0. The outro opens in it.
 *   32    the music returns (0.56) under the first forge.
 *   36    **the loudest onset in the track** (0.64). The four forges settle
 *         into a row and "Start for free" lands on it.
 *   38    the last boom (0.51, on a cluster peaking at 0.60 two bars' worth of
 *         eighths earlier). The lockup.
 *   39…42 the wind-down. The name folds back into the mark, "Coming Soon"
 *         comes and goes, and the film ends on the frame it started on.
 */

/** The track, relative to the shared asset library. */
export const TRACK = "audio/curated/music/The_Iron_Aria.mp3";

/** One bar, in frames. Everything in this file is counted in these. */
export const BAR = 51.0808;

/** Frame of the track's first big hit — bar zero. */
const ORIGIN = 463.29;

/** Bar `b` of the track, as a frame. Fractions are fine and are used. */
export const bar = (b: number): number => Math.round(ORIGIN + b * BAR);

/* ── Stage boundaries ─────────────────────────────────────────────────────── */

/**
 * Where each act starts. Every one of these is a measured onset, not a round
 * number — which is what the brief meant by "synced to the respective section
 * of the song".
 *
 * The brief's own timings are in the comments. `build` is the one that has
 * moved: the tour gained a claim ("Agentic kanban") and there was nowhere to
 * take a bar from that did not cost more, so the build-up now starts a bar
 * later than it did and than the brief asks. It is still on a bar line and
 * still inside the section the brief is describing.
 */
export const STAGE = {
  /** 0.00s — the mark, a prompt, and five lines. Brief: 00:00. */
  intro: 0,
  /** 15.44s — the first hit. Brief: 00:14. */
  product: bar(0), // 463
  /** 32.47s — the tour ends and the stage flips twice. Brief: 00:30. */
  build: bar(10), // 974
  /** 46.09s — the drop. Brief: 00:45.5. */
  harness: bar(18), // 1383
  /** 68.23s — the breakdown after the drop. Brief: 01:06. */
  outro: bar(31), // 2047
} as const;

/* ── Stage 1: the intro ───────────────────────────────────────────────────── */

/**
 * The typed lines, with the bar each one starts on.
 *
 * Five lines, not eleven. The first cut had a word a line accelerating into a
 * shrug, and the shape was right but it spent nine bars getting there; these
 * say the same thing in three sentences and leave the last two bars of the act
 * to the thing the act is actually for, which is the mark sitting alone on
 * black waiting to be hit.
 *
 * `cpf` is characters per frame. The list runs at 1.2 — one typist, not eleven
 * lines each fitted to its own slot, which is the distinction `Typewriter`'s
 * doc comment is about — and then slows twice. `...` is typed at 0.3, which is
 * a dot every three frames and is the pause made visible rather than described;
 * `You decide!` at 0.62 is the line being *said* rather than dashed off.
 *
 * `gapAfter` is how many frames of empty line follow, before the next starts.
 * The default (`ERASE_GAP`) reads as a breath; the long one after
 * "A.IDE...?" is the brief's short pause, and it is a pause on a bare
 * stage with the caret blinking on it.
 *
 * The last line is unpicked too — the brief's "then the text gets deleted,
 * showing just the logo" — which is why it carries an explicit `eraseAt` where
 * every other line's is worked out from the line after it.
 */
export const LINES = [
  { text: "Agent Orchestration System?", start: bar(-7), cpf: 1.2 },
  /* Bar −5 is the strongest onset in the whole intro (0.13 at 6.893s). */
  { text: "Agentic Git Client?", start: bar(-5), cpf: 1.2 },
  { text: "A.IDE...?", start: bar(-3.6), cpf: 1.2, gapAfter: 26 },
  { text: "...", start: bar(-2.4), cpf: 0.3 },
  { text: "You decide!", start: bar(-1.8), cpf: 0.62, eraseAt: bar(-1.0) },
] as const;

/**
 * Frames before the next line starts that this one must be gone by.
 *
 * Four frames of empty line, which reads as a breath rather than as a gap. Any
 * less and the erase and the next line's first character share a frame, which
 * looks like a glitch; any more and it stops being a breath and becomes the
 * pause that line 3 is given deliberately.
 */
export const ERASE_GAP = 4;

/** Frame the first character of the first line is typed on. */
export const TYPING_FROM = LINES[0].start;

/**
 * The prompt and the caret leaving, so the act ends on the mark alone.
 *
 * This is what makes the film loop. The last frame of the outro is the mark
 * centred on black and nothing else, and frame 0 has to be the same picture —
 * so the intro's row has to *collapse* back to the mark before the hit rather
 * than being cut away by it. Over these frames the `>_` and the caret fade and
 * their width goes to nothing, which walks the mark back to the centre of the
 * stage as the row shrinks around it.
 *
 * It finishes ten frames before bar 0, and those ten frames are the whole point
 * of the arrangement: a beat of nothing but the logo, and then the hit.
 */
export const PROMPT_OUT = [bar(-0.8), bar(-0.2)] as const; // 422 → 453

/* ── Stage 2: the eight claims ────────────────────────────────────────────── */

/**
 * The bar each product claim cuts on.
 *
 * `agents` gets two bars because it has three things to do — deal eleven marks
 * one at a time, cascade them into a row, and then show the picker doing it for
 * real. The other seven get one bar each, which is 1.70s: short, and
 * deliberately so. Eight claims and a logo reveal in seventeen seconds is a
 * montage, not a tour, and stretching any one of them means cutting another.
 *
 * Two of the three git claims are consecutive — repos then swarm — because they
 * are one argument made twice, and a viewer who has just been shown a sidebar of
 * repositories reads a commit graph as *those* repositories. The kanban was the
 * third of that run until v5 moved it to the end of the tour, which costs that
 * adjacency and is the client's call.
 */
export const CLAIM = {
  /** The lockup holds the stage alone for one bar after the hit. */
  lockup: bar(0), // 463
  agents: bar(1), // 514  — the roster deals here
  agentsVideo: bar(2), // 565  — …cascades into a row, and the picker cuts in
  repos: bar(3), // 617
  swarm: bar(4), // 668
  forge: bar(5), // 719
  browser: bar(6), // 770
  monitor: bar(7), // 821
  graph: bar(8), // 872  — the music's section change lands on this cut
  /*
    Last, on the client's fifth round ("show Agentic Kanban last"). It is one of
    the three beats still waiting on a recording, so putting it at the back of
    the tour also keeps the remaining title card off the run of real footage
    rather than sitting in the middle of it.

    Moving it cost nothing in the arrangement because what moved is the *order
    of the content*, not the grid: every claim is still one bar, the tour is
    still eight of them, and the two wipes inside it are still on bars 4 and 8.
    The bar-8 wipe used to be named for the monitor and is now named for the
    knowledge graph — same frame, same onset, different thing standing on it.
  */
  kanban: bar(9), // 923
  end: bar(10), // 974
} as const;

/* ── Stage 3: the build-up ────────────────────────────────────────────────── */

/**
 * Two bars of statement and four of features, then two of nothing.
 *
 * The statement is one sentence split across a change of stage: **"Replace no
 * one"** arrives as the film wipes to near-black and **"Empower everyone!"** as
 * it wipes straight back to white. That is the only place in
 * the film the surface changes twice inside two bars, and it is doing the work
 * the words are — the half about replacement is said in the dark and the half
 * about people is said in the light.
 *
 * Then three features on the light stage: Multi-window for two bars, then AI
 * Councils and Workflows on the track's own rising figure (measured onsets at
 * bars 14 and 15 — 0.50, 0.46). Bar 13's onset (0.09) is no longer a cut; it
 * falls inside the Multi-window shot, whose panels detach on the half-bar
 * accents instead (`BUILD.detach`). The accent
 * at bar 15.5 is deliberately *not* cut on: it would leave one bar between the
 * last name and the drop instead of two, and two is what the strip-back needs.
 */
export const BUILD = {
  /** "Replace no one" — the wipe to the dark stage lands under it. */
  replaceNoOne: bar(10), // 974
  /** "Empower everyone!" — and the stage is white again by the exclamation. */
  empower: bar(11), // 1025

  /**
   * The three features. Multi-window takes two bars — the one the Video Editor
   * card gave up when it was cut in v6 — and the other two a bar each.
   */
  items: [bar(12), bar(14), bar(15)] as const, // 1076, 1178, 1230

  /**
   * Multi-window's three detachments: the frame each panel stands beside the
   * main window as its own window.
   *
   * These are the track's, not the grid's. The bass is nearly absent in these
   * two bars (`PUNCH` reads 0.00–0.01), and what carries the pulse is an
   * off-beat accent every half bar — measured with a 150Hz high-pass at frames
   * 1083, 1108, 1134 and 1159, i.e. bars 12⅛, 12⅝, 13⅛, 13⅝. The first is seven
   * frames after the cut, too soon for the main window to be read on its own,
   * so the three panels take the other three: loops, then repos, then the
   * terminal, half a bar apart.
   *
   * The recording is timed to *arrive* at these, not start at them: each fold
   * in the main window finishes on the hit, so the collapse is seen just before
   * and the detached window lands with the beat (`clips.ts` `MULTI_WINDOW`).
   */
  detach: {
    loops: bar(12.625), // 1108
    repos: bar(13.125), // 1134
    terminal: bar(13.625), // 1159
  },

  /**
   * 42.70s — everything drains from here. The track's accents stop at bar 16.1
   * and it is near-silent from 44.4s, so the last two bars before the drop are
   * a stage going dark under a track going quiet. That emptiness is what makes
   * the drop land; filling it is the most common way to waste one.
   */
  breath: bar(16), // 1281

  /**
   * 45.00s — where the mark is home and the field starts closing on it.
   *
   * The strip-back has two halves and this is the seam. Over the first the mark
   * travels back to the middle and `Crescendo`'s field drifts inward loosely;
   * from here the mark is stationary at the centre and everything else
   * accelerates onto it. Both sides read this, which is the point: the field
   * implodes *onto the logo*, so the two cannot be timed independently — the
   * first cut of this had the mark still two thirds of the way home on the
   * frame the field was already tight, converging on a point the logo had not
   * reached.
   *
   * It is bar 17 rather than a chosen frame because the track empties to near
   * silence at bar 17.3, so the compression runs under the quietest part of
   * the strip-back and the explosion is the first loud thing after it.
   */
  implode: bar(17), // 1332
} as const;

/* ── Stage 4: the harness ─────────────────────────────────────────────────── */

/**
 * Four movements, thirteen bars, one line per bar or per two-thirds of one.
 *
 * The headings are on bar lines with a strong onset under them (18, 21, 25, 28
 * — all but 21 measured above 0.5) and the items between them are on the
 * two-thirds and the halves, which the drop's own eighth-note figure supports.
 */
export const HARNESS = {
  skills: {
    heading: bar(18), // 1383 — the drop
    items: [bar(19), bar(19.75), bar(20.5)] as const, // 1434, 1472, 1510
  },
  loops: {
    heading: bar(21), // 1536
    /** "/loop" alone, in the ramp, before the six that follow it. */
    loop: bar(21.5), // 1562
    /**
     * The six loops, half a bar each — 25.5 frames.
     *
     * They replace the six colour flashes this movement used to open with, and
     * they inherit that beat's argument rather than a new one: the drop's own
     * figure is in eighths, so a half-bar is four of them and the cascade never
     * falls between beats. What changed is what stands on each one. A flash was
     * a swatch and a name; this is an icon, a typed name in the loop's own hue
     * and a line of copy under it, which is the client's fifth round.
     *
     * Half a bar is 0.85s and that is short for three objects. It is the right
     * kind of short: six loops in five seconds is a roster being dealt, and the
     * alternative — a bar each — is six bars, which is the whole movement and
     * then some. The icon and the subtitle are therefore not typed; only the
     * name is, so each card has one thing arriving and two things simply there.
     */
    types: [bar(22), bar(22.5), bar(23), bar(23.5), bar(24), bar(24.5)] as const,
    // 1587, 1613, 1638, 1664, 1689, 1715
  },
  graphs: {
    heading: bar(25), // 1740
    items: [bar(26), bar(26.75), bar(27.5)] as const, // 1791, 1830, 1868
  },
  companion: {
    heading: bar(28), // 1894
    items: [bar(29), bar(29.67), bar(30.33)] as const, // 1945, 1979, 2013
  },
} as const;

/* ── Stage 5: the outro ───────────────────────────────────────────────────── */

export const OUTRO = {
  /** In the breakdown: the stage clears and "Connect with" arrives. */
  connect: bar(31), // 2047
  /** One forge a bar, from the frame the music comes back. */
  forges: [bar(32), bar(33), bar(34), bar(35)] as const, // 2098, 2149, 2200, 2251
  /** The loudest onset in the track: the row settles, the call to action lands. */
  startForFree: bar(36), // 2302

  /**
   * A shimmer crossing each forge in the row, one after another.
   *
   * On the off-beats, which is the brief's "the treble after each bass beat".
   * The kick is on the quarters of bar 36 and these are the eighths between
   * them — 12.8 frames apart, four of them inside one bar, so the cascade is
   * finished well before the row has to hold still for the boom two bars later.
   *
   * Counted on the grid rather than fitted to the onset list, and that is a
   * deliberate choice here: the off-beat content in this bar is hi-hat, which
   * a 40ms onset envelope registers as a smear rather than as four events. The
   * grid knows where the eighths are because the kick on the quarters proves it.
   */
  forgeShimmer: [bar(36.125), bar(36.375), bar(36.625), bar(36.875)] as const,
  // 2309, 2321, 2334, 2347

  /** The last boom. The lockup lands centred with the whole name out. */
  lockup: bar(38), // 2404

  /**
   * The name goes back where it came from.
   *
   * "Studio" is unpicked a character at a time and then the whole name folds
   * into the mark — `reveal` run backwards, which is the same property that
   * built the lockup at bar 0. What is left is the crescent, centred, which is
   * the picture the film opened on.
   */
  collapse: bar(39.5), // 2481

  /** "Coming Soon", under the mark, for a bar and a half. */
  comingSoon: bar(40.5), // 2532
} as const;

/**
 * Where the picture stops being anything but the logo, and where the file ends.
 *
 * ── The film is a loop ──────────────────────────────────────────────────────
 *
 * Frame 0 and frame `DURATION - 1` are the same picture: the crescent, centred
 * on pure black, its glow breathing. Nothing fades *it* out — what fades is
 * everything else, so the last thing to leave is "Coming Soon" and what is left
 * is what the film started with. Playing it twice in a row has no seam in it.
 *
 * `DECAY` is therefore about the stage, not the image: from here the near-black
 * page goes to true black and the outro's type goes with it.
 *
 * The audio is faded on its own ramp rather than left to the track: 88.0s is
 * not the end of the file (98.9s) and an unfaded cut there is a click. The
 * track's own last phrase resolves at 87.5s and is gone by 88.0s, so the music
 * lands on silence a beat after the picture has finished settling.
 */
export const DECAY = bar(41.5); // 2583 — 86.10s

/** 88.0 seconds. */
export const DURATION = 2640;
