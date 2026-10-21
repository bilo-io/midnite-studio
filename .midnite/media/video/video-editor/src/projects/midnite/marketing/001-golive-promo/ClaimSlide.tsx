import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";

import { FG, LIGHT, type Theme } from "../../../../shared/brand";
import { AppShot, type Approach } from "./AppShot";
import { CaptionLine } from "./CaptionLine";
import type { Shot } from "./clips";
import { CAPTION, CAPTION_GAP, CAPTION_MARK, WINDOW, WINDOW_LEFT } from "./layout";
import { themeMixAt } from "./wipes";

/** How fast a claim's title is typed, everywhere in the tour. */
export const CAPTION_CPF = 2.2;

/**
 * Frames after the cut that the first character lands on.
 *
 * Three, which is the title's own entrance — characters appearing while the
 * line is still moving reads as a glitch. The longest title, 25 characters at
 * 2.2 a frame, still finishes 27 frames inside the shortest claim.
 */
export const CAPTION_DELAY = 3;

/* ── One claim, over the app doing it ─────────────────────────────────────── */

/**
 * The tour layout: a title at the top left of the window's own column, and the
 * window under it.
 *
 * Left-aligned to the window's left edge rather than centred over it, because
 * the lockup lives at the head of that line and a persistent object cannot move
 * between cuts just because the next title is three characters shorter. The
 * first `CAPTION_MARK + CAPTION_GAP` pixels of the line belong to the mark and
 * nothing is drawn into them here.
 *
 * ── The card is struck onto the stage, not faded in ────────────────────────
 *
 * `AppShot` does the work — 70% to 100% over seven frames with a slide from one
 * edge and a bass-driven shake — and all this has to hand it is the composition
 * frame the beat lands on, because the shake is read out of the track and
 * `useCurrentFrame()` inside a scene is the scene's own clock.
 *
 * The push-in that used to be here has gone with it. It existed because these
 * recordings hold still for seconds at a time and a card held rigid reads as a
 * screenshot; the halo now turns and breathes behind every card for the whole
 * of its shot, which does that job without slowly changing the composition.
 */
export const ClaimSlide: React.FC<{
  text: string;
  shot: Shot;
  /** The composition frame this claim cuts on. */
  at: number;
  /** Which stage this claim is standing on. */
  theme?: Theme;
  /** Which edge the card arrives from. */
  from?: Approach;
  /** Extra content over the card — the agent row uses this. */
  children?: React.ReactNode;
  /**
   * Content under the card, in the card's own coordinates — for windows that
   * stand beside it and must not lay their halo over it. Multi-window uses this.
   */
  behind?: React.ReactNode;
  /** A transform on the card alone, not on what is laid out around it. */
  cardTransform?: string;
  /** The card's own size, where it is not the tour window's. Its slot stays `WINDOW`. */
  cardSize?: { width: number; height: number };
}> = ({ text, shot, at, theme = "light", from = "bottom", children, behind, cardTransform, cardSize = WINDOW }) => {
  const frame = useCurrentFrame();

  /*
    The title fades over three frames. It is type, not picture: a line switched
    on at full strength on the same frame as a new image under it fights the
    image for the eye.
  */
  const titleIn = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });

  /*
    The ink, asked of the wipes rather than assumed. Half the claims in this
    film land on the frame their own stage does, so for a few frames the title
    is standing on the stage it is *leaving* — and painted for the one it is
    arriving on it is not faint, it is absent. Measured at the first character's
    own column, which is where the failure would show first.
  */
  const ink = interpolateColors(
    themeMixAt(at + frame, WINDOW_LEFT + CAPTION_MARK + CAPTION_GAP),
    [0, 1],
    [FG.base, LIGHT.FG.base],
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: CAPTION.top, gap: 40 }}>
      <CaptionLine
        text={text}
        delay={CAPTION_DELAY}
        charsPerFrame={CAPTION_CPF}
        color={ink}
        theme={theme}
        style={{
          width: WINDOW.width,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [-8, 0])}px)`,
        }}
      />

      <div style={{ position: "relative" }}>
        {behind}
        <div style={{ transform: cardTransform, transformOrigin: "0 0" }}>
        <AppShot
          shot={shot}
          width={cardSize.width}
          height={cardSize.height}
          theme={theme}
          glow={theme === "light" ? 0.3 : 0.42}
          startsAt={at}
          from={from}
        />
        </div>
        {children}
      </div>
    </AbsoluteFill>
  );
};
