import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { uiFontFamily } from "../../../../../shared/fonts";
import { MidniteWordmark } from "../../../../../shared/MidniteWordmark";
import { Typewriter } from "../../../../../shared/Typewriter";
import { DURATION, ERASE_GAP, LINES, PROMPT_OUT } from "../beats";
import { bandsAt, punchAt, thumpAt } from "../energy";
import { MARK } from "../layout";

/**
 * Stage 1 — the mark, a prompt, and five lines nobody can keep up with.
 *
 * Black, white, one line at a time, and the only act of the film with no colour
 * in it but the glow behind the logo. That is the setup: the stage is bare so
 * the light theme landing on the first hit has something to land on.
 *
 * ── It opens and closes on the same picture the film does ───────────────────
 *
 * The first frames are the crescent alone, centred, breathing on black — and so
 * are the last frames of the outro, which is what makes this film a loop. The
 * prompt does not cut in; it unfurls out of the mark, exactly as the *name*
 * does on the hit at bar 0 and exactly as both fold back in at the close. The
 * mark is the one object on screen from the first frame to the last, and
 * everything else in the film arrives out of it and goes back into it.
 *
 * ── The row is centred as a row ─────────────────────────────────────────────
 *
 * Mark, then prompt and text — centred together, so the mark drifts left as a
 * line grows and back as it is unpicked. That is a deliberate choice against
 * the other two options and worth writing down, because "the logo moves" looks
 * at first like the bug the pilot's lockup had:
 *
 *   - **mark fixed, text centred** puts 600px of nothing between them on a
 *     short line and a normal gap on a long one, so the pair reads as two
 *     unrelated objects for most of the act.
 *   - **mark fixed, text left-aligned in a box the width of the longest line**
 *     keeps the gap but pins every short line a third of the way across the
 *     screen, and the brief's word was "centre".
 *   - **centred as a row** moves the mark by half a character per frame, which
 *     is continuous and reads as the line centring itself. The pilot's failure
 *     was a *jump* — a flex child arriving and re-laying-out its siblings in
 *     one frame — which is a different thing.
 *
 * It also gives the handoff for free. With the prompt collapsed the row *is*
 * the mark, so the mark is dead centre — which is precisely where `MARK.open`
 * puts it, and where `TravellingMark` picks it up on the frame this act ends.
 *
 * The caret is out of flow inside `Typewriter`, so it does not push the row
 * around as it blinks; the row's width is exactly the characters that are typed.
 */

/** The line's type size. The longest line, 27 characters of Poppins, is well under 1000px. */
const TYPE = 56;

/**
 * How wide the prompt block is allowed to be while it is unfurling.
 *
 * The same idiom as `MidniteWordmark`'s name: a clip whose *width* animates,
 * with the gap to the mark as a margin *inside* the clip so it collapses with
 * everything else. At `prompt: 1` the cap is lifted entirely and the block is
 * its natural width, so the ceiling only has to be comfortably past the widest
 * thing it ever has to reveal — which, with the `>_` glyph removed (the
 * client's fourth round), is the bare caret alone: a zero-width strut plus a
 * 0.075em-wide rule at `TYPE=56`, a handful of pixels. 200 was sized for the
 * glyph this act no longer draws; 48 is one character-cell's width at this
 * size, comfortably past the caret with headroom to spare.
 */
const PROMPT_UNFURL = 48;

/** The prompt coming out of the mark, well before there is anything to type. */
const PROMPT_IN = [18, 46] as const;

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();

  /*
    Which line is on screen: the last one to have started. Only one is ever
    mounted, which is the brief's "only ever showing one line at a time" taken
    literally — an un-mounted line cannot be caught on a frame it should not be.
  */
  const index = LINES.reduce((found, line, i) => (frame >= line.start ? i : found), -1);
  const line = index >= 0 ? LINES[index] : null;

  /* Out of the mark at the top of the act, back into it before the hit. */
  const prompt = interpolate(
    frame,
    [PROMPT_IN[0], PROMPT_IN[1], PROMPT_OUT[0], PROMPT_OUT[1]],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        /* The mark's own station, so this act hands over without moving it. */
        transform: `translateY(${MARK.open.dy}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {/*
          The same component `TravellingMark` draws from bar 0 — at the same
          size, on the same centre line, with the same glow. This act owns it
          only because the row it is centred in belongs to this act; the object
          does not change hands, only the thing that is positioning it.
        */}
        <MidniteWordmark
          size={MARK.open.size}
          markOnly
          theme="dark"
          aura={1}
          thump={thumpAt(frame)}
          punch={punchAt(frame)}
          bands={bandsAt(frame)}
          /* The film loops, so the glow has to — see `auraLoop`. */
          auraLoop={DURATION}
        />

        <div
          style={{
            maxWidth: prompt >= 1 ? undefined : PROMPT_UNFURL * prompt,
            overflow: prompt >= 1 ? undefined : "hidden",
            /* Headroom for the caret and the face's descenders inside the clip. */
            paddingTop: TYPE,
            paddingBottom: TYPE,
            marginTop: -TYPE,
            marginBottom: -TYPE,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              /* Inside the clip, so the gap folds away with everything else. */
              marginLeft: 34,
              /* The titles' face — `TypedTitle`'s family, weight and tracking. */
              fontFamily: uiFontFamily,
              fontWeight: 600,
              fontSize: TYPE,
              lineHeight: 1,
              letterSpacing: "-0.005em",
              color: "#ffffff",
            }}
          >
            {line === null ? (
              /*
                Before the first character there is still a caret, blinking on
                an empty line — the brief's entry. An empty `Typewriter` is
                exactly that and costs no second component: it has nothing to
                type, so it is immediately "done", and `hideCursorWhenDone:
                false` leaves the caret blinking.
              */
              <Typewriter text="" hideCursorWhenDone={false} caret="bar" />
            ) : (
              <Typewriter
                /*
                  Keyed by index so React rebuilds the span when the line
                  changes. Without it the element is reused and the *old* line's
                  characters are still mounted on the frame the new one starts,
                  which shows up as a single frame of the previous word.
                */
                key={index}
                text={line.text}
                delay={line.start}
                charsPerFrame={line.cpf}
                eraseAt={eraseAt(index)}
                hideCursorWhenDone={false}
                caret="bar"
              />
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * The frame line `i` starts being unpicked.
 *
 * Every line but the last is worked backwards from the *next* line's beat
 * rather than forwards from its own, because the beat is the fixed thing: move
 * a line in `beats.ts` and the erase before it moves with it, with nothing else
 * to remember. `gapAfter` is how much empty line to leave — the default is a
 * breath, and the long one after "A.IDE...?" is the brief's short pause.
 *
 * The last line carries its own `eraseAt`, because there is no next line to
 * work back from and because what follows it is not another line: it is the
 * prompt folding into the mark and then the hit.
 */
const eraseAt = (i: number): number | undefined => {
  const line = LINES[i];
  if ("eraseAt" in line) return line.eraseAt;
  const next = LINES[i + 1];
  if (!next) return undefined;
  /* `Typewriter`'s default erase speed. */
  const back = line.text.length / (line.cpf * 2.2);
  const gap = "gapAfter" in line ? line.gapAfter : ERASE_GAP;
  return next.start - gap - Math.ceil(back);
};
