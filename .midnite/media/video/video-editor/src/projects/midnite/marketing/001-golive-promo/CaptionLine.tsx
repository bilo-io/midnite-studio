import { TypedTitle } from "../../../../shared/TypedTitle";
import type { Theme } from "../../../../shared/brand";
import { CAPTION, CAPTION_GAP, CAPTION_MARK } from "./layout";

/**
 * The line the mark and a page title share, in one place.
 *
 * Three scenes draw this line — the tour's claims, the agent claim, and the
 * harness's movement headings — and all three have to agree with a fourth thing
 * that is not in any of them: the travelling lockup, which stands at the head of
 * the line and is positioned from `MARK.caption`. Four copies of the same box
 * is four chances for one of them to drift, and the drift would be a few pixels
 * of misalignment that nobody would think to re-measure.
 *
 * ── The optical shift is measured, not derived ─────────────────────────────
 *
 * `line-height` centres the font's *content box* — ascent plus descent — in the
 * line box, and the cap box is not centred inside that. How far off depends
 * entirely on the face's own metrics, and this one's are lopsided: at 50px on a
 * 60px line the baseline lands 53px down, which is an ascent of 1.06em against a
 * descent of 0.14em, and a cap height of 0.56em.
 *
 * The result, measured off rendered stills at f640 and f1460 — identical in both
 * themes, which is what says it is the layout and not the content:
 *
 * | | top | bottom | centre |
 * |---|---|---|---|
 * | mark | 70 | 119 | 94.5 |
 * | title cap box | 89 | 117 | 103.0 |
 *
 * So the title is pulled up by the difference, and the caps then straddle the
 * mark's centre with 10px of mark above them and 11px below. Re-measure this if
 * the face, the size or the line changes; it is the same kind of number as
 * `ForgeLogo`'s `TRIM` and the wordmark's clip headroom, and it is arrived at
 * the same way — off a render, not off the spec sheet.
 */
const CAP_SHIFT = -9;

export const CaptionLine: React.FC<{
  text: string;
  /** Frames after the scene's start that the first character lands. */
  delay: number;
  charsPerFrame: number;
  /** The readable layer's colour — usually an `interpolateColors` on the wipes. */
  color: string;
  theme: Theme;
  /**
   * How far the line is indented past the mark. The default leaves exactly the
   * mark's own width plus the shared gap, which is the space the lockup stands
   * in; the list layout uses the same because both share this line.
   */
  paddingLeft?: number;
  style?: React.CSSProperties;
}> = ({
  text,
  delay,
  charsPerFrame,
  color,
  theme,
  paddingLeft = CAPTION_MARK + CAPTION_GAP,
  style,
}) => (
  <div
    style={{
      paddingLeft,
      height: CAPTION.line,
      display: "flex",
      alignItems: "center",
      boxSizing: "border-box",
      ...style,
    }}
  >
    <TypedTitle
      text={text}
      delay={delay}
      charsPerFrame={charsPerFrame}
      fontSize={CAPTION.size}
      lineHeight={CAPTION.line}
      color={color}
      theme={theme}
      style={{ marginTop: CAP_SHIFT }}
    />
  </div>
);
