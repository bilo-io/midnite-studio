import {
  AbsoluteFill,
  Sequence,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from "remotion";

import { FG, LIGHT, type Theme } from "../../../../../shared/brand";
import { ShimmerLine } from "../../../../../shared/ShimmerLine";
import { BUILD, STAGE } from "../beats";
import type { Approach } from "../AppShot";
import { ClaimSlide } from "../ClaimSlide";
import { STAGE3 } from "../clips";
import { STATEMENT_TEXT_SHIFT } from "../layout";
import { MultiWindow } from "./MultiWindow";
import { themeAt, themeMixAt } from "../wipes";

/**
 * Stage 3 — the build-up. One sentence said twice, and then three more things.
 *
 * Eight bars, and the shape of them is the track's: two bars of statement, four
 * of features — Multi-window's two and a bar each for the others — and then two
 * bars of nothing at all. The acceleration
 * is the build and the emptiness at the end is the breath — the music's accents
 * stop at bar 16 and it is near-silent by 44.4s, so the last stretch before the
 * drop is a stage going quiet under a track going quiet.
 *
 * Filling that gap is the most common way to waste a drop, so nothing is drawn
 * in it. What little is on screen — the bloom and the motes — belongs to
 * `Backdrop`, and it is already fading them out by then.
 *
 * ── The statement is one sentence across a change of stage ──────────────────
 *
 * **"Replace no one"** on near-black, **"Empower everyone!"** on white, a bar
 * apart, with a liquid wipe under each. It is the only place in the film
 * the surface changes twice inside two bars, and the reason is the sentence:
 * the half about replacement is said in the dark and the half about people is
 * said in the light. Both wipes are in `wipes.ts` with everything else that
 * changes the stage — this file only draws the type standing on it.
 *
 * Neither line is a title. They are set at the same size as each other and land
 * on the frame their own stage does, so what the viewer sees is the stage
 * turning over and the words arriving with it rather than words appearing on a
 * stage that then happens to change.
 *
 * ── The mark stands to the left of it, as one pair ───────────────────────────
 *
 * The client's fourth round asked for the logo "on the left of either piece of
 * text" (`EDITORIAL_SCRIPT.md` §9.3). Both lines were independently centred on
 * the stage — each at ≈960 — so the mark could not simply park beside one of
 * them without a different gap to the other. Instead each line here is shifted
 * right by `STATEMENT_TEXT_SHIFT`, the same fixed amount for both, and the mark
 * (drawn by `TravellingMark` in `Promo.tsx`, at `STATEMENT_MARK` in `layout.ts`)
 * sits a constant gap to its left — so the *pair* is centred on the stage for
 * both lines rather than the line alone, which is what "one lockup" means here.
 * See `layout.ts`'s note on `STATEMENT_MARK` for the algebra.
 *
 * ── Three features, and the first one is two bars ─────────────────────────
 *
 * Multi-window, AI Councils, Workflows. The fourth, the Video Editor, was cut
 * in the client's sixth round and its bar given to Multi-window, which needs
 * it: that shot is a window coming apart into four, one panel per accent
 * (`MultiWindow.tsx`), and a bar is not long enough to see three things happen.
 */

/** What each of the two statement lines says, and which stage it says it on. */
const STATEMENT: readonly { at: number; until: number; text: string; theme: Theme }[] = [
  { at: BUILD.replaceNoOne, until: BUILD.empower, text: "Replace no one", theme: "dark" },
  { at: BUILD.empower, until: BUILD.items[0], text: "Empower everyone!", theme: "light" },
];

/** The three features, in the order the brief lists them. */
const FEATURES = ["Multi-window", "AI Councils", "Workflows"] as const;

/** Which edge each card arrives from — cycled, for the reason in `Product.tsx`. */
const APPROACH: readonly Approach[] = ["top", "right", "bottom", "left"];

export const BuildUp: React.FC = () => {
  const ends = [...BUILD.items.slice(1), BUILD.breath];

  return (
    <AbsoluteFill>
      {STATEMENT.map((line) => (
        <Sequence
          key={line.text}
          from={line.at - STAGE.build}
          durationInFrames={line.until - line.at}
          name={line.text}
        >
          <Statement
            text={line.text}
            theme={line.theme}
            at={line.at}
            until={line.until - line.at}
          />
        </Sequence>
      ))}

      {FEATURES.map((text, i) => (
        <Sequence
          key={text}
          from={BUILD.items[i] - STAGE.build}
          durationInFrames={ends[i] - BUILD.items[i]}
          name={text}
        >
          {i === 0 ? (
            <MultiWindow text={text} from={APPROACH[0]} />
          ) : (
            <ClaimSlide
              text={text}
              shot={STAGE3[i]}
              at={BUILD.items[i]}
              theme={themeAt(BUILD.items[i])}
              from={APPROACH[i % APPROACH.length]}
            />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * One half of the sentence, alone on its stage for a bar.
 *
 * `ShimmerLine` rather than plain type, because these are the two lines in the
 * film with no picture beside them and nothing else to hold the eye — and
 * because the brief asked for shimmer, which the intro answers with a raking
 * streak and this answers with the ramp glowing off the letterforms.
 *
 * The sweep is a sawtooth: the highlight crosses over `SWEEP.length` frames and
 * then waits out the rest of the period off the right-hand edge. It starts ten
 * frames in, which keeps it off the frames the line is still arriving on, where
 * a sweep reads as part of the entrance rather than as a property of the type.
 */
const SWEEP = { length: 34, period: 46 } as const;

const Statement: React.FC<{ text: string; theme: Theme; at: number; until: number }> = ({
  text,
  theme,
  at,
  until,
}) => {
  const frame = useCurrentFrame();

  /*
    The readable layer's colour, asked of the wipes rather than assumed.

    Each of these two lines lands on the frame its own wipe starts, so for the
    first few frames it is standing on the stage it is *leaving*. Painted for
    the stage it is arriving on, "Empower everyone!" is near-black type on a
    near-black page for four frames — not faint, absent — and "Don't replace
    anyone" is the same failure in white. Same source as the lockup's crossfade,
    for the same reason: see `themeMixAt`.

    Only the solid layer is tweened. The ramp glowing off it switches outright
    with the line's own theme, which is invisible: it is a blurred halo, and the
    two ramps differ in value rather than in hue.
  */
  const ink = interpolateColors(
    themeMixAt(at + frame, 960),
    [0, 1],
    [FG.base, LIGHT.FG.base],
  );

  const arrive = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  /* Out under the next cut, over the last eight frames. */
  const leave = interpolate(frame, [until - 8, until], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cycles = (frame - 10) / SWEEP.period;
  const shimmer =
    cycles < 0
      ? -0.3
      : interpolate(cycles - Math.floor(cycles), [0, SWEEP.length / SWEEP.period], [-0.2, 1.2], {
          extrapolateRight: "clamp",
        });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity: arrive * leave,
          /*
            The pair-centring shift (see the file's own note above) plus the
            entrance's own arrival, on one transform — the line still slides up
            into place, just `STATEMENT_TEXT_SHIFT` right of where it would sit
            centred alone.
          */
          transform: `translate(${STATEMENT_TEXT_SHIFT}px, ${interpolate(arrive, [0, 1], [18, 0])}px)`,
        }}
      >
        <ShimmerLine
          shimmer={shimmer}
          color={ink}
          fontSize={104}
          fontWeight={600}
          stroke={2.2}
          theme={theme}
        >
          {text}
        </ShimmerLine>
      </div>
    </AbsoluteFill>
  );
};

/** The build-up's typed captions, for the keyboard layer. */
export const BUILD_CAPTIONS: readonly { at: number; text: string }[] = FEATURES.map((text, i) => ({
  at: BUILD.items[i],
  text,
}));
