import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { uiFontFamily } from "../../../../shared/fonts";
import { MidniteWordmark } from "../../../../shared/MidniteWordmark";
import { SfxSound, TypingSound } from "../../../../shared/Sfx";
import { SmokeStreak } from "../../../../shared/SmokeStreak";
import { typedCount } from "../../../../shared/Typewriter";
import { Backdrop } from "./Backdrop";
import { BUILD, CLAIM, DECAY, DURATION, HARNESS, LINES, OUTRO, STAGE, TRACK } from "./beats";
import { CAPTION_CPF, CAPTION_DELAY } from "./ClaimSlide";
import { bandsAt, punchAt, thumpAt } from "./energy";
import { CAPTION_MARK, MARK, STAGE as BOX, STATEMENT_MARK, lerp } from "./layout";
import { BuildUp, BUILD_CAPTIONS } from "./stages/BuildUp";
import {
  Harness,
  HARNESS_HEADINGS,
  HARNESS_ITEMS,
  HARNESS_SLUGS,
  HEADING_CPF,
  ITEM_CPF,
  SLUG_CPF,
} from "./stages/Harness";
import { Intro } from "./stages/Intro";
import { ComingSoon, Outro } from "./stages/Outro";
import { Product, TOUR_CAPTIONS } from "./stages/Product";
import { WIPES, themeMixAt } from "./wipes";

/**
 * The go-live promo — 88.0 seconds, cut to `The_Iron_Aria`.
 *
 * Five acts, one grid. The track is a finished piece with its own structure and
 * every cut in this film is on one of its bars (`beats.ts`), which is the
 * opposite arrangement from the pilot: there the soundtrack was built to the
 * edit, here the edit is built to the soundtrack. Nothing in this file contains
 * a frame number that is not imported.
 *
 * ── It is a loop ────────────────────────────────────────────────────────────
 *
 * Frame 0 and the last frame are the same picture: the crescent, centred on
 * pure black, its glow breathing. Everything in between arrives out of that
 * mark and goes back into it — the prompt unfurls from it in the intro and
 * folds back before the hit, the name unfurls from it on the hit and folds back
 * at the close.
 *
 * That has one consequence worth stating plainly, because it is the opposite of
 * what a film normally does: **there is no composition-wide fade to black.**
 * The stage going black is `Backdrop`'s business and the outro's own type fades
 * itself, so the mark can simply stay.
 *
 * What runs the length of the film rather than belonging to an act:
 *
 *   - **the surface** — `Backdrop`, five surfaces and four liquid wipes, on the
 *     schedule in `wipes.ts`. A background per scene would unmount each one at
 *     the boundary, which is exactly where a transition has to be mid-flight.
 *   - **the mark** — one `MidniteWordmark`, on screen from the first frame to
 *     the last, travelling between four stations and changing colour under
 *     every wipe that crosses it.
 *   - **the sound** — the track, the one-shots, and every keystroke. All of it
 *     is mounted here rather than inside the scenes, because a one-shot swells
 *     before it peaks and a `<Sequence>` starting on the beat would clip away
 *     precisely the part that builds to it.
 */

/** Music level. The one place the track's gain is written. */
const MUSIC = 0.82;

/** Per-keystroke level. Subtle at one keystroke has to stay subtle at two hundred. */
const KEYS = 0.15;

export const Promo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000000", fontFamily: uiFontFamily }}>
    {/*
      The track is 98.9s and this cut is 88.0s, so it is faded rather than
      simply ending — an unfaded cut at 88.0s is a click. It lands on silence a
      beat after the picture has finished settling onto the mark.
    */}
    <Audio
      src={staticFile(TRACK)}
      volume={(f) =>
        MUSIC *
        interpolate(f, [DECAY, DURATION - 2], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />

    <SoundLayer />

    <Backdrop />

    <Sequence durationInFrames={STAGE.product} name="1 · Intro">
      <Intro />
    </Sequence>

    <Sequence from={STAGE.product} durationInFrames={STAGE.build - STAGE.product} name="2 · Product">
      <Product />
    </Sequence>

    <Sequence from={STAGE.build} durationInFrames={STAGE.harness - STAGE.build} name="3 · Build-up">
      <BuildUp />
    </Sequence>

    <Sequence from={STAGE.harness} durationInFrames={STAGE.outro - STAGE.harness} name="4 · Harness">
      <Harness />
    </Sequence>

    <Sequence from={STAGE.outro} name="5 · Outro">
      <Outro />
    </Sequence>

    {/*
      The black the film ends on.

      From the moment the name starts folding back into the mark, everything
      under this goes to true black — the near-black page, the bloom drifting
      across it, whatever is left of the outro. What is left is the mark on the
      same pure black frame 0 is on, which is what makes the file loop. The mark
      and "Coming Soon" are mounted above it, deliberately.
    */}
    <Blackout />

    {/*
      Above the scenes and outside every one of them: the mark belongs to the
      film, not to a section of it, and a `<Sequence>` would unmount it at the
      first cut. The intro draws its own copy of it — see `TravellingMark` — and
      hands over on the frame this one appears.
    */}
    <TravellingMark />

    {/* The last thing to arrive, and the last to leave. */}
    <ComingSoon />

    <StreakLayer />
  </AbsoluteFill>
);

/**
 * True black, laid over everything the film is done with.
 *
 * It arrives with the collapse and is complete well before the last frame, so
 * the film ends on the mark over the same pure black it started on — and
 * nothing under it has to be faded out by hand.
 */
const Blackout: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        opacity: interpolate(frame, [OUTRO.collapse, OUTRO.collapse + 40], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        pointerEvents: "none",
      }}
    />
  );
};

/* ── Sound ────────────────────────────────────────────────────────────────── */

/**
 * Every one-shot and every keystroke, at the top level.
 *
 * The one-shots are positioned by the beat they *land* on, and `SfxSound` works
 * backwards from that through each file's measured swell — the riser's is seven
 * seconds. Mounting one inside the scene it accompanies would clip the swell.
 *
 * The keystrokes are here for a duller reason: `TypingSound` schedules from a
 * `TypewriterTiming`, and the timings live in `beats.ts` and in the scene files'
 * exported caption lists, so this is the one place that can see all of them.
 */
const SoundLayer: React.FC = () => (
  <>
    {/* ── Structure ── */}
    {/* The first hit: the light theme arrives and the name comes out of the mark. */}
    <SfxSound atFrame={STAGE.product} kind="big" volume={0.5} />
    {/*
      One light whoosh per claim cut. Low, and lower than the pilot's, because
      there are fourteen of them in this film against nine in that one — past a
      certain count a swoosh stops reading as punctuation and starts reading as
      weather.
    */}
    {[
      CLAIM.agents,
      CLAIM.repos,
      CLAIM.swarm,
      CLAIM.kanban,
      CLAIM.forge,
      CLAIM.browser,
      CLAIM.monitor,
      CLAIM.graph,
      BUILD.replaceNoOne,
      BUILD.empower,
      ...BUILD.items,
    ].map((at) => (
      <SfxSound key={at} atFrame={at} kind="light" volume={0.24} />
    ))}

    {/*
      The riser runs exactly the strip-back: its ledge lands on the drop, and its
      head is trimmed to the two bars the track spends emptying rather than to
      the seven seconds the file carries. A riser that starts before the music
      starts falling is a riser fighting the arrangement.
    */}
    <SfxSound
      atFrame={STAGE.harness}
      kind="riser"
      volume={0.5}
      head={STAGE.harness - BUILD.breath}
    />
    <SfxSound atFrame={STAGE.harness} kind="impact" volume={0.58} />

    {/* Each movement of the harness gets one, and the outro gets two. */}
    {[HARNESS.loops.heading, HARNESS.graphs.heading, HARNESS.companion.heading].map((at) => (
      <SfxSound key={at} atFrame={at} kind="light" volume={0.26} />
    ))}
    <SfxSound atFrame={OUTRO.connect} kind="big" volume={0.42} />
    <SfxSound atFrame={OUTRO.startForFree} kind="light" volume={0.3} />
    <SfxSound atFrame={OUTRO.lockup} kind="big" volume={0.5} />

    {/* ── The keyboard ── */}
    {LINES.map((line) => (
      <TypingSound
        key={line.text}
        length={line.text.length}
        charsPerFrame={line.cpf}
        from={line.start}
        volume={KEYS}
      />
    ))}

    {[...TOUR_CAPTIONS, ...BUILD_CAPTIONS].map((caption) => (
      <TypingSound
        key={`${caption.at}-${caption.text}`}
        length={caption.text.length}
        charsPerFrame={CAPTION_CPF}
        /* The scene's own `delay`, so the first character lands where it does. */
        from={caption.at + CAPTION_DELAY}
        volume={KEYS}
      />
    ))}

    {HARNESS_HEADINGS.map((heading) => (
      <TypingSound
        key={`${heading.at}-${heading.text}`}
        length={heading.text.length}
        charsPerFrame={HEADING_CPF}
        from={heading.at + 3}
        volume={KEYS}
      />
    ))}

    {/*
      The harness list, which is typed too. Quieter than everything else: these
      are twelve lines under a drop, and at the same level as a heading they
      stop being a texture and start being a rattle — which is what made the
      first cut leave them untyped altogether. See the note in `Harness.tsx`.
    */}
    {HARNESS_ITEMS.map((item) => (
      <TypingSound
        key={`${item.at}-${item.text}`}
        length={item.text.length}
        charsPerFrame={ITEM_CPF}
        from={item.at}
        volume={KEYS * 0.72}
      />
    ))}

    {/*
      The two centred movements' slugs. A separate list from the items above
      because they type at their own rate — `TypingSound` lays a click per
      character from the rate it is given, and one list at the wrong speed is a
      keyboard that finishes before the word does.
    */}
    {HARNESS_SLUGS.map((slug) => (
      <TypingSound
        key={`${slug.at}-${slug.text}`}
        length={slug.text.length}
        charsPerFrame={SLUG_CPF}
        from={slug.at}
        volume={KEYS * 0.72}
      />
    ))}

    {/* "Studio", typed twice — once on the reveal and once on the close. */}
    <TypingSound
      length={QUALIFIER.length}
      charsPerFrame={QUALIFIER_CPF}
      from={STAGE.product + UNFURL}
      volume={KEYS * 1.2}
    />
    <TypingSound
      length={QUALIFIER.length}
      charsPerFrame={QUALIFIER_CPF}
      from={OUTRO.lockup + UNFURL}
      volume={KEYS * 1.2}
    />
  </>
);

/* ── The streaks ──────────────────────────────────────────────────────────── */

/**
 * A raking band of light across every structural cut, torn into smoke.
 *
 * `SmokeStreak`, not `SwooshStreak`, and everywhere rather than in the harness
 * alone: the film's transitions are liquid, and punctuating the cuts *inside* an
 * act with a clean airbrushed flare was two visual languages sharing a reel.
 * The brief's own note was that the smoke should be there "almost every time
 * there is a shimmer".
 *
 * Mounted *on* the beat, unlike the sounds: a streak needs no anticipation, and
 * one that starts early reads as a stray highlight rather than as a transition.
 * Directions alternate throughout, so a run of cuts never reads as one object
 * crossing the film a dozen times.
 *
 * Ids and seeds come from the frame each one lands on, which makes them unique
 * without a counter — and `LiquidWipe`'s note applies here too: `url(#id)` is
 * document-global, and two streaks sharing one would silently share whichever
 * filter rendered last.
 *
 * The three in the intro are white — see `SmokeStreak`'s `tint`. They are the
 * brief's "shimmer effects" for an act that is deliberately monochrome, and a
 * violet streak would be the only colour in it besides the logo's own glow.
 */
const STREAKS: readonly { at: number; length: number; intensity: number; tint?: string }[] = [
  ...[LINES[0].start, LINES[2].start, LINES[4].start].map((at) => ({
    at,
    length: 22,
    /*
      Low, and lower than anything else here. This act is a small white mark on
      pure black, so a band crossing it has nothing to rake across and reads as
      a smear on the lens rather than as light on a surface. Just enough to see.
    */
    intensity: 0.12,
    tint: "#ffffff",
  })),

  { at: STAGE.product, length: 22, intensity: 0.5 },
  ...[
    CLAIM.agents,
    CLAIM.repos,
    CLAIM.swarm,
    CLAIM.kanban,
    CLAIM.forge,
    CLAIM.browser,
    CLAIM.monitor,
    CLAIM.graph,
  ].map((at) => ({ at, length: 16, intensity: 0.36 })),

  { at: BUILD.replaceNoOne, length: 20, intensity: 0.44 },
  { at: BUILD.empower, length: 20, intensity: 0.44 },
  ...BUILD.items.map((at) => ({ at, length: 16, intensity: 0.36 })),

  /* The drop gets a longer, brighter one — and no light whoosh under it. */
  { at: STAGE.harness, length: 26, intensity: 0.6 },
  ...[HARNESS.loops.heading, HARNESS.graphs.heading, HARNESS.companion.heading].map((at) => ({
    at,
    length: 18,
    intensity: 0.34,
  })),

  { at: OUTRO.connect, length: 22, intensity: 0.46 },
  { at: OUTRO.startForFree, length: 20, intensity: 0.4 },
  { at: OUTRO.lockup, length: 26, intensity: 0.56 },
];

/**
 * The frames a wipe lands on, so the streak over each of them can be the one a
 * change of stage deserves rather than the one a cut inside an act gets.
 *
 * Four of the eight wipes sit on beats that already had a streak — a claim cut,
 * a movement heading — because that is where a stage is allowed to turn over.
 * Rather than write those intensities twice and let them drift, the list below
 * is built from the beats and this raises whichever of them a wipe landed on.
 */
const WIPE_FRAMES = new Set(WIPES.map((wipe) => wipe.at));

const StreakLayer: React.FC = () => (
  <>
    {STREAKS.map((streak, i) => (
      <Sequence key={streak.at} from={streak.at} durationInFrames={streak.length} layout="none">
        <SmokeStreak
          id={`smoke-${streak.at}`}
          durationInFrames={WIPE_FRAMES.has(streak.at) ? Math.max(streak.length, 22) : streak.length}
          direction={i % 2 === 0 ? 1 : -1}
          intensity={WIPE_FRAMES.has(streak.at) ? Math.max(streak.intensity, 0.5) : streak.intensity}
          tint={streak.tint}
          seed={(streak.at % 29) + 1}
        />
      </Sequence>
    ))}
  </>
);

/* ── The mark, and the four places it lives ───────────────────────────────── */

/** Frames the name takes to come out of the mark, or to fold back into it. */
const UNFURL = 16;
/** Frames the mark takes to fly between two of its stations. */
const FLY = 18;
/** Typing speed for the qualifier — six characters in 18 frames. */
export const QUALIFIER_CPF = 0.34;
export const QUALIFIER = "Studio";

/** How long the word takes to type, and therefore also to unpick. */
const SPELL = Math.ceil(QUALIFIER.length / QUALIFIER_CPF);

/** The frame the name starts folding back into the mark, once "Studio" is gone. */
const FOLD = OUTRO.collapse + SPELL + 2;

/**
 * How wide the name is, as a multiple of the mark's height.
 *
 * Measured with `bbox.py` over a rendered still of the finished lockup — 601px
 * at `size: 140`. It is here rather than only in `MidniteWordmark` because the
 * mark's *position* depends on it: the lockup is centred as a pair, so while the
 * name is out the crescent sits left of the middle by half the name, and the
 * theme crossfade needs to know which column of the stage the crescent is
 * actually standing in.
 */
const NAME_WIDTH = 4.29;

/**
 * The mark, from the first hit to the last frame.
 *
 * Four stations and three journeys. What makes them read as one object rather
 * than as four is that the name folds back into the mark on the way out of the
 * centre and unfurls out of it again on the way back — `reveal` run backwards,
 * the same property that builds the lockup in the first place. At the two
 * caption stations the lockup is *only* the mark, which is why those can have a
 * fixed x while the other two are centred.
 *
 * Nothing is drawn before the hit, because the intro is drawing the same mark at
 * the same size on the same centre line inside a row it owns. The handoff is
 * exact rather than approximate: by bar 0 the intro's prompt has folded away, so
 * its row *is* the mark, centred — which is `MARK.open`.
 *
 * ── It changes colour four times, and it is computed, not timed ─────────────
 *
 * The film wipes black → light → dark → light → dark, and this object is on
 * screen through all of it. A white crescent on 99%-lightness paper is not
 * subtly wrong, it is a blank space where the logo should be.
 *
 * Two stacked copies, crossfaded, rather than interpolated colours: the crescent
 * is an `<Img>` of a flat-filled SVG and a file cannot be tweened. What drives
 * the crossfade is `themeMixAt`, which asks the wipes themselves how much of the
 * incoming stage has reached the column the mark is standing in on this frame.
 *
 * That replaced four hand-written interpolations, and the replacement is not
 * tidiness. Two of the four were wrong in the first render — a white crescent on
 * white paper for a quarter of a second at one wipe, an ink one on near-black
 * for six tenths at another — because the right frame depends on the wipe's
 * length, its easing, its direction *and* where the mark happens to be standing,
 * and all four of those live somewhere else. Neither failure shows up in a
 * thumbnail.
 */
const TravellingMark: React.FC = () => {
  const frame = useCurrentFrame();

  const ease = {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  } as const;

  const up = interpolate(frame, [CLAIM.agents, CLAIM.agents + FLY], [0, 1], ease);
  /*
    Down from the caption line to stand beside "Replace no one," across to
    "Empower everyone!" on the wipe that already turns the stage over at that
    beat (`BUILD.empower` — motivated, not a spare move), and back up to the
    caption line as the features start. See `STATEMENT_MARK` in
    `layout.ts` for why this is two stations rather than one.
  */
  const toStatement = interpolate(
    frame,
    [BUILD.replaceNoOne, BUILD.replaceNoOne + FLY],
    [0, 1],
    ease,
  );
  const toEmpower = interpolate(frame, [BUILD.empower, BUILD.empower + FLY], [0, 1], ease);
  const fromStatement = interpolate(frame, [BUILD.items[0], BUILD.items[0] + FLY], [0, 1], ease);
  /*
    Back to the middle for the two bars the track spends emptying before the
    drop, and bigger than it has been all film.

    This is the only journey that is not `FLY` frames long. Every other one is a
    move between two layouts and wants to be over quickly; this one *is* the
    build-up, so it takes a whole bar — a logo being drawn to the middle rather
    than a cut to a bigger one.

    It lands on `BUILD.implode` rather than running to the drop, and that is not
    a taste call: `Crescendo` closes its field onto this station, so the mark
    has to *be* there before the field arrives. Run to the drop on an ease-in,
    the mark was still two thirds of the way home at f1360 while the smoke was
    already tight around a point it had not reached — the two objects converging
    on different places, which a still shows immediately and a description of
    the schedule does not. The remaining fifty frames are the mark standing
    still at the centre while everything else accelerates onto it.
  */
  const toBreath = interpolate(frame, [BUILD.breath, BUILD.implode], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const across = interpolate(frame, [STAGE.harness, STAGE.harness + FLY], [0, 1], ease);
  /*
    Out of the list column, back to the middle and up, to stand over "Connect
    with" at nearly four times the size it has been carrying for the last fifty
    seconds. The outro opens in the quietest two bars in the track with nothing
    else on the stage, and this is the film handing the frame back to the logo.
  */
  const toConnect = interpolate(frame, [OUTRO.connect, OUTRO.connect + FLY], [0, 1], ease);
  const down = interpolate(frame, [OUTRO.lockup, OUTRO.lockup + FLY], [0, 1], ease);

  /*
    Eight blends in sequence. Each one is applied on top of the last, so the
    value at any frame is "wherever the most recent journey has got to" without
    any of them needing to know which act it is.
  */
  const at = (key: "size" | "dx" | "dy") =>
    lerp(
      lerp(
        lerp(
          lerp(
            lerp(
              lerp(
                lerp(
                  lerp(MARK.open[key], MARK.caption[key], up),
                  STATEMENT_MARK.replaceNoOne[key],
                  toStatement,
                ),
                STATEMENT_MARK.empowerEveryone[key],
                toEmpower,
              ),
              MARK.caption[key],
              fromStatement,
            ),
            MARK.breath[key],
            toBreath,
          ),
          MARK.column[key],
          across,
        ),
        MARK.connect[key],
        toConnect,
      ),
      MARK.close[key],
      down,
    );

  const size = at("size");
  const dx = at("dx");
  const dy = at("dy");

  const unfurl = interpolate(frame, [STAGE.product, STAGE.product + UNFURL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  /*
    The name goes out on the hit, in on the way up to the caption line, out
    again as the mark flies home, and in for good as the film closes. The last
    one is what makes the file loop.
  */
  const foldBack = interpolate(frame, [FOLD, FOLD + UNFURL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const reveal = Math.max(unfurl * (1 - up), down) * (1 - foldBack);

  /*
    "Studio" is typed twice — on the reveal and again on the close, which is the
    brief's own repeat — and unpicked once, at the collapse. Between the first
    two it is simply present: the qualifier is not being written during the body
    of the film, it is part of the mark.

    Both phases go through `typedCount`, the same function that drives every
    other line of type in this film, so the keystrokes `TypingSound` schedules
    from the same timings cannot drift from the glyphs.

    The switch to the close phase is at `OUTRO.lockup`, **not** at the frame the
    typing starts. The name begins unfurling on the boom and the first character
    is `UNFURL` frames later; leaving the qualifier at full length across that
    gap showed the finished word for sixteen frames, then blanked it and typed
    it again — a pop, right on the film's biggest beat.
  */
  const qualifierChars =
    frame < CLAIM.agents
      ? typedCount(frame, QUALIFIER.length, {
          delay: STAGE.product + UNFURL,
          charsPerFrame: QUALIFIER_CPF,
        })
      : frame < OUTRO.lockup
        ? QUALIFIER.length
        : typedCount(frame, QUALIFIER.length, {
            delay: OUTRO.lockup + UNFURL,
            charsPerFrame: QUALIFIER_CPF,
            eraseAt: OUTRO.collapse,
            /*
              Unpicked at typing speed rather than at `Typewriter`'s 2.2×
              backspace: this is the lockup being taken apart deliberately, not
              a line being corrected.
            */
            eraseCharsPerFrame: QUALIFIER_CPF,
          });

  const caret =
    (frame >= STAGE.product + UNFURL && frame < STAGE.product + UNFURL + SPELL) ||
    (frame >= OUTRO.lockup + UNFURL && frame < OUTRO.collapse + SPELL);

  /*
    Where the crescent actually is, which is not `960 + dx`: the lockup is
    centred as a pair, so while the name is out the mark sits left of the middle
    by half the name's width.
  */
  const markX = BOX.width / 2 + dx - (reveal * size * NAME_WIDTH) / 2;
  const themeMix = themeMixAt(frame, markX);

  /*
    The glow is proportional to how big the mark is, which is another way of
    saying "to whether the mark is the subject". Alone on the stage it is the
    thing being looked at and carries its full aura; at the caption station it is
    a 46px bullet at the head of a line of type, and a logo throwing a rainbow
    halo across a product screenshot there would be a distraction.
  */
  const aura = interpolate(size, [CAPTION_MARK, MARK.open.size], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Nothing before the hit: the intro owns the mark until then. */
  if (frame < STAGE.product) return null;

  /*
    The cone is driven harder while the mark is standing over "Connect with".

    The woofer already scales with `size`, which is most of it — but that beat
    is the one place in the film where the logo is alone on the stage *with the
    music underneath it*, where the intro has no bass to speak of and the close
    is a wind-down. Half again on top of the size is what makes it read as the
    brief's "even more" rather than as the same effect on a bigger object. It
    comes back off as the mark flies home, so the close is the open's twin.

    The strip-back before the drop is driven harder still — the client's "even
    more ecstatic" — and it is driven *by the journey* rather than by a second
    schedule: `toBreath` eases in, so the cone winds up as the mark is drawn to
    the middle and is at its most violent over the ten frames of compression,
    which is exactly where `Crescendo` has the field at its tightest. It comes
    off again over `across`, so the harness inherits a mark at its normal gain.

    There is one thing this deliberately does *not* do: soften the hit. `PUNCH`
    is at its largest in the whole film on the drop, and the temptation is to
    cap the emphasis so the mark does not tear. Letting it tear is the point —
    that frame is the loudest the picture gets.
  */
  const emphasis = 1 + toConnect * (1 - down) * 0.55 + toBreath * (1 - across) * 0.85;
  const drive = (v: number) => Math.min(1, v * emphasis);

  const props = {
    size,
    qualifier: QUALIFIER,
    reveal,
    qualifierChars,
    caret,
    aura,
    thump: drive(thumpAt(frame)),
    punch: drive(punchAt(frame)),
    /* The spectrum ring. Gated on `aura` inside the mark, so it costs nothing
       at the caption station where it would be a smudge. */
    bands: bandsAt(frame),
    auraLoop: DURATION,
  } as const;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translate(${dx}px, ${dy}px)`,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "relative" }}>
        <div style={{ opacity: 1 - themeMix }}>
          <MidniteWordmark {...props} theme="dark" />
        </div>
        {/*
          The light copy is laid over the dark one and takes its box, so the two
          are the same lockup at the same size and the crossfade is a dissolve
          rather than two marks at slightly different widths.
        */}
        <div style={{ position: "absolute", inset: 0, opacity: themeMix }}>
          <MidniteWordmark {...props} theme="light" />
        </div>
      </div>
    </AbsoluteFill>
  );
};
