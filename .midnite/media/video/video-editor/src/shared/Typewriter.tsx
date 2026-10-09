import { useCurrentFrame } from "remotion";

import { rainbowGradient } from "./brand";

/**
 * Text typed out a character at a time — and, where a line has to make way for
 * the next one, unpicked again — with a cursor that blinks while it waits and
 * stops blinking while it works.
 *
 * Deterministic in the frame, like everything else here: the visible substring
 * is a function of `useCurrentFrame()` and nothing else, so scrubbing backwards
 * in Studio un-types it and a re-render of any single frame is identical. A
 * `setInterval` would give none of that.
 *
 * `charsPerFrame` rather than a total duration, because a list of lines set at
 * one speed reads as one typist; a list where each line is fitted to the same
 * duration reads as a machine slowing down for the long ones.
 */

/** How a line is typed, and — optionally — unpicked again. */
export type TypewriterTiming = {
  /** Frames to wait after the component mounts before the first character. */
  delay?: number;
  /** Typing speed. Default 0.9 ≈ 27 characters/second at 30fps. */
  charsPerFrame?: number;
  /**
   * Frame at which the line starts being deleted. Omitted, it never is.
   *
   * A frame rather than a duration because what the edit actually knows is
   * *when the next line has to start*, and the erase has to be finished by
   * then — working backwards from a beat is the only version of this that stays
   * right when a beat moves.
   */
  eraseAt?: number;
  /**
   * Deleting speed. Defaults to 2.2× the typing speed, which is roughly what a
   * held backspace does and, more usefully, means a line that took a bar to
   * type clears in under half of one.
   */
  eraseCharsPerFrame?: number;
};

/**
 * How many characters of `text` are on screen at `frame`.
 *
 * Exported because two things need to agree on it exactly: the glyphs, and the
 * keyboard one-shots `TypingSound` fires under them. A sound layer that
 * recomputed the schedule from the same inputs would drift the moment one of
 * them changed on only one side.
 */
export const typedCount = (
  frame: number,
  length: number,
  { delay = 0, charsPerFrame = 0.9, eraseAt, eraseCharsPerFrame }: TypewriterTiming = {},
): number => {
  const typed = Math.max(0, Math.min(length, Math.floor((frame - delay) * charsPerFrame)));
  if (eraseAt === undefined || frame < eraseAt) return typed;
  const back = Math.floor((frame - eraseAt) * (eraseCharsPerFrame ?? charsPerFrame * 2.2));
  return Math.max(0, typed - back);
};

/**
 * The frames on which a character *appears* — one per keystroke, for the sound.
 *
 * Deduplicated, and that is the load-bearing part rather than a tidiness one.
 * Above one character per frame the schedule asks for two or three clicks on
 * the same frame, which does not read as fast typing: it reads as a single
 * louder click, because they are phase-aligned copies of one file and sum
 * rather than overlap. Capping at one click per frame turns a 2.2×-speed
 * caption into a 30-per-second burst, which is fast typing.
 *
 * Erasing is deliberately silent. Backspace on a real board is the same switch
 * and would be the same sound, but two hundred keystrokes in a cut is already
 * at the edge of "subtle", and half of them being the sound of text
 * disappearing is where a texture becomes a rattle.
 */
export const keystrokeFrames = (
  length: number,
  { delay = 0, charsPerFrame = 0.9 }: TypewriterTiming = {},
): number[] => {
  const frames: number[] = [];
  let last = -1;
  for (let i = 1; i <= length; i++) {
    const frame = delay + Math.ceil(i / charsPerFrame);
    if (frame !== last) frames.push(frame);
    last = frame;
  }
  return frames;
};

/**
 * Which caret to draw.
 *
 *   block  the `▋` glyph — a terminal cursor, set in the line's own face.
 *   bar    a thin vertical rule in the brand ramp. Narrower than a glyph can
 *          be (a monospaced block is a whole advance wide) and the only one of
 *          the three that can carry a gradient, since a glyph's colour is paint
 *          on the face and a rule is a box.
 *   none   no caret at all. For a second copy of a line stacked under the one
 *          that has it — `TypedTitle`'s glow layer — where the two have to be
 *          the same box and only one of them may draw the cursor.
 */
export type CaretKind = "block" | "bar" | "none";

export const Typewriter: React.FC<
  TypewriterTiming & {
    text: string;
    /** Hide the cursor once the line is finished — for all but the last line. */
    hideCursorWhenDone?: boolean;
    /** Which caret to draw. Default `block`. */
    caret?: CaretKind;
    /**
     * Paint the `bar` caret a flat colour instead of the brand ramp.
     *
     * For a line that is already in a colour of its own — stage 4's loops, each
     * typed in its own hue — where a rainbow caret would be the one part of the
     * word that is not that loop's colour. Left off, the ramp is the default and
     * every other caret in a midnite film keeps it.
     */
    caretColor?: string;
    /** The cursor glyph, when `caret` is `block`. */
    cursor?: string;
    /**
     * Render the untyped remainder transparent so the line keeps its final
     * width from the first frame.
     *
     * Off by default, because a line that is alone on the stage should grow.
     * On, for a line that is centred *with something else* — a growing string
     * walks its neighbours sideways under the typing, which is the mistake
     * `MidniteWordmark`'s qualifier exists to avoid.
     */
    reserveWidth?: boolean;
    style?: React.CSSProperties;
  }
> = ({
  text,
  delay = 0,
  charsPerFrame = 0.9,
  eraseAt,
  eraseCharsPerFrame,
  hideCursorWhenDone = true,
  caret = "block",
  caretColor,
  cursor = "▋",
  reserveWidth = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const timing = { delay, charsPerFrame, eraseAt, eraseCharsPerFrame };
  const typed = typedCount(frame, text.length, timing);
  const settled = typed >= text.length;
  const working = !settled || (eraseAt !== undefined && frame >= eraseAt && typed > 0);

  /*
    Blink only when idle. A cursor that keeps blinking through the typing
    flickers against the characters appearing beside it, and a cursor that
    never blinks reads as a rendering artefact once the line stops growing.
  */
  const blinkOn = Math.floor(frame / 15) % 2 === 0;
  const cursorVisible = working ? true : hideCursorWhenDone ? false : blinkOn;

  return (
    <span style={{ whiteSpace: "pre", ...style }}>
      {/*
        A zero-width strut, and it fixes a real bug rather than tidying one.

        On the frames where nothing is typed yet — the blinking cursor before
        the first line, and the gap after a line has been unpicked — this span's
        only content is the caret, which is out of flow. CSS treats a line box
        containing no text and no inline with margins, padding or borders as
        **zero-height**, so the whole line collapsed; in a row centred with
        `align-items: center` that moved the caret down by half the face, which
        is exactly what it looked like: a cursor that sat correctly while typing
        and dropped the moment the line emptied.

        An inline-block is an atomic inline and always contributes, so a
        zero-advance one holding a space gives the line the font's own metrics
        whether or not there is text beside it. `overflow: hidden` is what makes
        it zero-advance without `whiteSpace: pre` preserving the space.
      */}
      <span aria-hidden style={{ display: "inline-block", width: 0, overflow: "hidden" }}>
        &nbsp;
      </span>
      {text.slice(0, typed)}
      {/*
        The caret belongs to the *typed* half and hangs out of flow. Put after
        the whole word it would sit at the end of the space the untyped
        characters are reserving, a word away from the letter it should follow;
        put in flow it would push those characters along and undo the point of
        reserving them.
      */}
      {caret === "none" ? null : caret === "bar" ? (
        /*
          The bar gets a box of its own — `1em` tall, no width — rather than
          hanging off an empty inline. A rule has to be positioned against
          something with a known height, and an empty inline's box is whatever
          the line happens to give it.
        */
        <span
          style={{
            position: "relative",
            display: "inline-block",
            width: 0,
            height: "1em",
            verticalAlign: "-0.18em",
          }}
        >
          {/*
            ── The bar's height is the cap height, near enough, in both faces ──

            The anchor above spans `baseline − 0.82em` to `baseline + 0.18em`, so
            these two numbers put the rule from 0.73em above the baseline to
            0.04em below it. That is within three hundredths of the cap height of
            both faces this repo sets — Poppins at 0.70em and JetBrains Mono at
            0.73em — which is what makes one pair of numbers right for a page
            title and for a terminal prompt.

            It was 0.06 / 0.88, which is 0.76em above the baseline and 0.12em
            below: a caret a quarter taller than the capitals beside it, hanging
            under the line. Beside 50px type that is six pixels of rule below the
            baseline, and it reads as the caret being mis-set rather than as a
            style.
          */}
          <span
            style={{
              position: "absolute",
              left: 0,
              top: "0.09em",
              width: "0.075em",
              height: "0.77em",
              borderRadius: "0.04em",
              ...(caretColor
                ? { backgroundColor: caretColor }
                : { backgroundImage: rainbowGradient(180) }),
              opacity: cursorVisible ? 1 : 0,
            }}
          />
        </span>
      ) : (
        <span style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 0, opacity: cursorVisible ? 1 : 0 }}>
            {cursor}
          </span>
        </span>
      )}
      {reserveWidth ? <span style={{ opacity: 0 }}>{text.slice(typed)}</span> : null}
    </span>
  );
};
