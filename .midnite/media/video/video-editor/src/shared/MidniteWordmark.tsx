import { Img, staticFile, useCurrentFrame } from "remotion";

import {
  THEME,
  type Theme,
  themeRainbowGradient,
  themeRainbowStops,
  themeRainbowText,
} from "./brand";
import { brandFontFamily, uiFontFamily } from "./fonts";
import { MarkWaveform } from "./MarkWaveform";

/**
 * The crescent and the name — midnite's lockup, as one component.
 *
 * It mirrors the website's own `Wordmark` exactly
 * (`midnite-studio/packages/website/src/components/wordmark.tsx`), and the
 * split is the whole point: **Midnite** is the brand and is set in the brand
 * face a third larger than the line; the qualifier after it says *which* of
 * midnite's apps this is and stays in the UI face, one muted step back. Set
 * both in the script face and it reads as one made-up word.
 *
 * `size` is the mark's height in pixels and everything else is `em`-relative
 * to it, so one number scales the whole lockup.
 *
 * Two props exist only for building the lockup on screen rather than cutting to
 * it — `reveal` and `qualifierChars`. Both leave the finished mark identical to
 * what a still would draw, so nothing that simply shows the lockup has to know
 * they exist.
 *
 * `theme` exists for a different reason: a film that wipes from the near-black
 * page to the product's light one and back carries this lockup straight across
 * the wipe, and **every one of its three colours has to change with the stage**
 * — the crescent's cut, the qualifier's grey, and the ramp on the brand word.
 * Miss any one and it is not subtly off, it is invisible: the white crescent on
 * 99%-lightness paper is a blank space where the logo should be. Defaulting to
 * `dark` keeps every existing composition drawing exactly what it drew before.
 */
export const MidniteWordmark: React.FC<{
  /** Height of the crescent in px; the name scales with it. Default 64. */
  size?: number;
  /** The word after "Midnite". `null` leaves the brand word standing alone. */
  qualifier?: string | null;
  /** Hides the name, leaving the crescent. */
  markOnly?: boolean;
  /** Paint the brand word with the rainbow ramp rather than flat foreground. */
  rainbow?: boolean;
  /**
   * How much of the name is out: 0 is the bare crescent, 1 the whole lockup.
   *
   * The name unfurls *from* the mark rather than fading in on top of it, and
   * that is a layout animation, not an opacity one — see the note on the
   * wrapper below for why it has to be.
   */
  reveal?: number;
  /**
   * How many characters of the qualifier are typed. The rest keep their space,
   * so the lockup does not grow as the word arrives. Defaults to all of them.
   */
  qualifierChars?: number;
  /**
   * Draw a caret after the qualifier. It is positioned out of flow, so turning
   * it on, blinking it and turning it off move nothing.
   */
  caret?: boolean;
  /** Which stage the lockup is standing on. Default `dark`. */
  theme?: Theme;
  /**
   * Strength of the ramp glow behind the crescent, 0…1. Default 0 — off.
   *
   * The glow is a rotating conic sweep of the theme's own ramp, blurred out
   * past the mark's edge, with a slow breath on top of it. Conic rather than
   * linear because a linear ramp behind a round mark has a light side and a
   * dark side and reads as a lit object; a conic one has the whole ramp at
   * every radius, so it reads as the mark *emitting*.
   *
   * Off by default so that every composition that simply draws the lockup keeps
   * drawing exactly what it drew before.
   */
  aura?: number;
  /**
   * Where the woofer cone is, 0…1 — see `energy.ts` in a project that has one.
   *
   * Scales the crescent and brightens the aura with it. The name does not move:
   * the mark is a fixed-size flex child and this is a CSS transform, so it grows
   * about its own centre and the lockup's layout is untouched.
   */
  thump?: number;
  /**
   * The strike rather than the displacement, 0…1. Throws the crescent around on
   * the frames a drum lands — see `Mark`, where "chaotic" is spelled out.
   */
  punch?: number;
  /**
   * One value per spectrum band, 0…1 — `bandsAt(frame)` from a project's
   * `energy.ts`. Draws a waveform ring in the glow. Omitted, there is no ring.
   */
  bands?: readonly number[];
  /**
   * Make the glow's idle animation repeat every `auraLoop` frames.
   *
   * For a film that **loops** — one whose last frame is meant to run straight
   * into its first. The glow breathes on two slow sines and its ramp turns at a
   * fixed rate, none of which has anything to do with the film's length, so the
   * last frame of a 2640-frame cut caught the breath near its peak while frame
   * 0 had it at its trough: the same mark in the same place, visibly brighter,
   * which on a loop is a flash on every repeat.
   *
   * Given a length, each period is nudged to the nearest one that divides it a
   * whole number of times and the ramp to the nearest whole number of turns.
   * The shifts are under one percent — 71 frames becomes 71.35 — so nothing
   * about how it looks changes, and the animation is then exactly periodic in
   * the film.
   */
  auraLoop?: number;
  style?: React.CSSProperties;
}> = ({
  size = 64,
  qualifier = "Studio",
  markOnly = false,
  rainbow = true,
  reveal = 1,
  qualifierChars,
  caret = false,
  theme = "dark",
  aura = 0,
  thump = 0,
  punch = 0,
  bands,
  auraLoop,
  style,
}) => {
  const frame = useCurrentFrame();
  const tokens = THEME[theme];
  /** How much of the qualifier is typed, clamped to the word. */
  const shown =
    qualifierChars === undefined
      ? (qualifier?.length ?? 0)
      : Math.max(
          0,
          Math.min(qualifier?.length ?? 0, Math.floor(qualifierChars)),
        );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: size * 0.52,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Mark
        size={size}
        theme={theme}
        aura={aura}
        thump={thump}
        punch={punch}
        bands={bands}
        frame={frame}
        loop={auraLoop}
      />
      {markOnly ? null : (
        /*
        The name lives in a box whose *width* is what animates, clipped to it.

        A fade or a mask would have been easier and would have been wrong: a
        lockup is centred as a whole, so a name that is merely invisible still
        holds its space and leaves the crescent sitting a name's-width
        left of centre for as long as it is hidden. Animating the width instead
        means the row really is just the mark at `reveal: 0` — the mark is on
        the centre line — and the pair slide apart into their final positions as
        the name comes out. The same reason `AgentRow` is mounted from frame 0
        in the pilot, arrived at from the other direction.

        `maxWidth` rather than `width`, so the top of the ramp does not have to
        be the exact natural width: anything at or past it simply resolves to
        it. Overshooting is free and only finishes the unfurl a few frames
        early; undershooting would clip the name until `reveal` reaches 1 and
        then pop. `4.5` is measured with 5% to spare — `bbox.py` over a rendered
        still of the finished lockup puts the name at 4.29 × `size` (601px at
        `size: 140`), and a wider qualifier or a future face should still unfurl
        rather than be cut.

        The gap to the mark is the inner block's `marginLeft`, *not* padding on
        this box. Padding cannot be clipped away: `box-sizing: border-box` still
        refuses to shrink a border box below its own padding, so a 0.32em pad
        here left the mark half a gap — a measured 21px at `size: 140` — off the
        centre line for the whole of the logo-only beat. A margin on the content
        is inside the clip and disappears with it.

        The vertical padding is undone by the matching negative margins: it is
        there because `overflow: hidden` clips at the padding box, and a script
        face's ascenders and descenders run well outside the line box.
      */
        <div
          style={{
            maxWidth: reveal >= 1 ? undefined : size * 4.5 * reveal,
            overflow: reveal >= 1 ? undefined : "hidden",
            paddingTop: size * 0.5,
            paddingBottom: size * 0.5,
            marginTop: size * -0.5,
            marginBottom: size * -0.5,
          }}
        >
          {/*
          The gap here is only the optical nudge left over once the brand half's
          own clip headroom is counted — see below. It was `size * 0.09` when
          that headroom did not exist and the gap was absorbing the overshoot.
        */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginLeft: size * 0.32,
              gap: size * 0.02,
            }}
          >
            <span
              style={{
                fontFamily: brandFontFamily,
                fontSize: "1.35em",
                letterSpacing: "0.025em",
                /*
                **`paddingRight` is not spacing, it is headroom for the clip.**
                `rainbowText()` is `background-clip: text`, and a background
                clipped to text is still only painted inside the *element's*
                box: ink that overshoots the box gets no paint and the name
                reads as cut off. A script face's glyphs are wider than their
                advances, so there is always some overshoot — summed over
                "Midnite", Damion's ink reaches 0.104em past the advance box
                (the final `e`'s tail).

                **It is a per-face number.** Kaushan Script, which this
                replaced, overshot by 0.051em; a future face re-measures rather
                than inheriting this. The value and the method are the
                website's own — midnite-studio
                `packages/website/src/components/wordmark.tsx`, which pads by
                the same 0.15em for the same reason.
              */
                paddingRight: "0.15em",
                ...(rainbow ? themeRainbowText(theme) : { color: tokens.FG.base }),
              }}
            >
              Midnite
            </span>
            {qualifier === null ? null : (
              <span
                style={{
                  fontFamily: uiFontFamily,
                  fontWeight: 500,
                  color: tokens.FG.muted,
                }}
              >
                {/*
                The qualifier is split at the typing head rather than sliced to
                it: the characters still to come are rendered, transparent, so
                they keep their space. A slice would grow the word as it typed,
                and since the lockup is centred that would walk the whole mark
                leftwards under the typing.
              */}
                <span style={{ position: "relative" }}>
                  {qualifier.slice(0, shown)}
                  {/*
                  The caret hangs off the *typed* half, out of flow. Off the
                  whole qualifier it would sit at the end of the reserved space,
                  a word's width from the letter it is supposed to follow; in
                  flow it would push the untyped half along and undo the point
                  of reserving it.
                */}
                  {caret ? (
                    /*
                      A thin rule in the ramp rather than a block glyph, which is
                      what every other caret in a midnite film is — see
                      `Typewriter`'s `caret="bar"`. A monospaced block is a whole
                      advance wide and cannot carry a gradient, because a glyph's
                      colour is paint on the face where a rule is a box.

                      Sized in `em` off the qualifier's own font size, so it
                      tracks the lockup from the 46px caption station to the
                      180px one in the outro without a second number.

                      ── It sits on the baseline, and it did not ───────────────

                      v3 brought every caret in this film to one geometry — from
                      0.73em above the baseline to 0.04em below — and this one
                      was missed, because it is positioned from the *line box*
                      rather than from the baseline and so looked unrelated to
                      the numbers that fixed the others. Measured on a still of
                      the outro lockup at f2450, against the cap of the "S"
                      beside it:

                      |        | top | bottom | height |
                      |--------|-----|--------|--------|
                      | caret  | 489 | 567    | 79     |
                      | S cap  | 512 | 574    | 63     |

                      Which is the client's "a bit too far up" exactly: it began
                      23px above the capitals and its foot hung 7px clear of the
                      baseline, so it read as floating rather than as sitting on
                      the line. At the ≈88px this station sets, the convention's
                      0.77em total puts it at 510–578 — a caret two pixels
                      taller than the caps it stands next to, resting on the
                      baseline like the type.
                    */
                    <span
                      style={{
                        position: "absolute",
                        left: "100%",
                        marginLeft: "0.14em",
                        top: "0.32em",
                        width: "0.075em",
                        height: "0.77em",
                        borderRadius: "0.04em",
                        backgroundImage: themeRainbowGradient(theme, 180),
                      }}
                    />
                  ) : null}
                </span>
                <span style={{ opacity: 0 }}>{qualifier.slice(shown)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * The crescent, its glow, and the woofer.
 *
 * Split out of the lockup because it is the one part of it that moves on its
 * own: the name is type and sits still, and the mark breathes, swells on the
 * bass and buzzes on the strike. Keeping that in here means the lockup's own
 * layout — a flex row centred as a pair — never sees any of it.
 *
 * **Nothing here changes the layout.** The wrapper is exactly `size` square and
 * the movement is a CSS transform on a child, so the name beside it does not
 * shift by a pixel however hard the cone is driven. The aura is absolutely
 * positioned and `overflow` is left alone so it can spill well past the mark,
 * which is the point of a glow.
 */
/**
 * A deterministic pseudo-random in `[0, 1)` from an integer.
 *
 * The whole of "chaotic" below is this function. It has to be a *function of
 * the frame* rather than a `Math.random()`, or the render stops being
 * reproducible and scrubbing backwards stops matching — the one property every
 * animation in this repo is built on. The multiply-and-take-the-fraction trick
 * is the standard shader hash; it is not a good random number generator and
 * does not need to be, because what it is used for is jitter.
 */
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const Mark: React.FC<{
  size: number;
  theme: Theme;
  aura: number;
  thump: number;
  punch: number;
  bands?: readonly number[];
  frame: number;
  loop?: number;
}> = ({ size, theme, aura, thump, punch, bands, frame, loop }) => {
  /*
    The nearest period to `want` that fits a whole number of times into `loop` —
    see `auraLoop` above. Without a loop it is `want` unchanged.
  */
  const fit = (want: number): number =>
    loop ? loop / Math.max(1, Math.round(loop / want)) : want;

  /*
    Two slow, incommensurable breaths rather than one: a single sine is a
    metronome the eye locks onto within a couple of cycles, and 71 against 47
    frames does not repeat for nearly two minutes — longer than any cut this is
    used in.
  */
  const breath =
    0.5 +
    0.28 * Math.sin((frame / fit(71)) * Math.PI * 2) +
    0.22 * Math.sin((frame / fit(47)) * Math.PI * 2);

  /*
    The ramp's own rotation: a little under a revolution a minute. Expressed as
    a period rather than a rate so that it can be fitted to the loop the same
    way the breaths are — 400 frames is 0.9° a frame.
  */
  const turn = ((frame / fit(400)) * 360) % 360;

  /*
    ── The cone ───────────────────────────────────────────────────────────────

    14% at full drive. It was 7%, which was a speaker moving; the brief asked
    for more, and past about 16% the crescent starts colliding with the name
    beside it at the lockup's own proportions.

    It is a *fraction* rather than a number of pixels, which is what makes the
    same component right at both ends of the film: at the 46px caption station
    the whole effect is under a pixel, where a logo pumping on every kick would
    be a tic.

    ── And why it is not a clean scale ────────────────────────────────────────

    A cone driven hard does not stay round. `sx` and `sy` are pushed in opposite
    directions by the same jitter, so the mark flexes rather than inflating; it
    rocks a couple of degrees; and it is thrown a few pixels in both axes. All
    four come from `hash(frame + k)` with different offsets, so they are
    uncorrelated with each other and with the beat — which is the difference
    between "chaotic" and "shaking in time", and the latter reads as the whole
    frame being unstable rather than as the logo being hit.

    Everything is multiplied by `punch`, not by `thump`, so the mark is still
    between strikes and only misbehaves on the frames a drum actually lands.
  */
  const flex = (hash(frame + 53) - 0.5) * punch * 0.06;
  const sx = 1 + thump * 0.14 + flex;
  const sy = 1 + thump * 0.14 - flex;

  const throwBy = punch * size * 0.05;
  const dx = (hash(frame) * 2 - 1) * throwBy;
  const dy = (hash(frame + 97) * 2 - 1) * throwBy;
  const rock = (hash(frame + 211) * 2 - 1) * punch * 4.5;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {aura > 0 ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            /* Centred on the mark and half again as wide, so the glow is behind it. */
            left: size * -0.5,
            top: size * -0.5,
            width: size * 2,
            height: size * 2,
            borderRadius: "50%",
            /*
              A conic sweep of the ramp, turning a little under a revolution a
              minute, over a radial falloff that stops the square corners of the
              gradient box showing through the blur.
            */
            backgroundImage: `conic-gradient(from ${turn}deg, ${themeRainbowStops(theme)})`,
            WebkitMaskImage: "radial-gradient(closest-side, #000 18%, transparent 72%)",
            maskImage: "radial-gradient(closest-side, #000 18%, transparent 72%)",
            filter: `blur(${size * 0.16}px)`,
            opacity: aura * (0.58 + breath * 0.34 + thump * 0.46),
            transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${1 + thump * 0.24})`,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {/*
        A flat re-fill of the mark, never the `currentColor` one: these are
        static SVG files loaded through <Img>, and a file referenced by URL
        cannot inherit a colour from the page — `currentColor` in that context
        resolves to the SVG's own initial `color`, which is black. That is
        invisible on the near-black stage, and on the light stage it is
        *accidentally* right, which is worse: it would work until someone gave
        the file a `color` and then quietly stop. `assets/logos/midnite/` carries
        an explicit cut per stage (`scripts/make-logo-cuts.mjs`) so neither case
        is a coincidence.
      */}
      {/*
        The ring rides the glow: outside the crescent, inside the halo, and
        gated on `aura` so it costs nothing where the mark is a bullet.
      */}
      {bands && aura > 0 ? (
        <MarkWaveform size={size} bands={bands} frame={frame} theme={theme} strength={aura} />
      ) : null}

      <Img
        src={staticFile(`logos/midnite/midnite-mark-${theme === "dark" ? "white" : "ink"}.svg`)}
        style={{
          position: "relative",
          width: size,
          height: size,
          transform: `translate(${dx}px, ${dy}px) rotate(${rock}deg) scale(${sx}, ${sy})`,
        }}
      />
    </div>
  );
};
