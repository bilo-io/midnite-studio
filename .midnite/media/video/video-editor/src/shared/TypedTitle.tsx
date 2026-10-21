import { type Theme, themeRainbowStops } from "./brand";
import { uiFontFamily } from "./fonts";
import { Typewriter, type TypewriterTiming } from "./Typewriter";

/**
 * A page title, typed out, with the brand ramp glowing off it.
 *
 * Two copies of the same line at the same moment of the same typing, stacked
 * and sharing one typographic box:
 *
 *   1. **glow** — the ramp, clipped to the glyphs *and* a thick text stroke,
 *      blurred. What escapes the letterforms is the halo; the stroke is what
 *      gives it something to escape from.
 *   2. **body** — the line itself, solid, in `color`, with the caret.
 *
 * That is `ShimmerLine`'s first two layers, with the string replaced by "however
 * much of it has been typed by now". They cannot drift apart because both are
 * the same `Typewriter` with the same timing — the glow one simply draws no
 * caret, which is what `caret="none"` is for.
 *
 * ── Why the titles are set in the UI face and not the mono one ──────────────
 *
 * The first cut set every caption in JetBrains Mono, on the argument that a
 * caption quoting the product's own UI should look like the product's own UI.
 * On a 1920-wide stage at 44px that reads as a terminal prompt rather than as a
 * title, which is right for the intro — where the act *is* a terminal — and
 * wrong for a montage of product claims. The intro keeps the mono face; from
 * bar 0 the film is a product page and its titles are set like one.
 *
 * ── The glow layer's box is bigger than the body's ─────────────────────────
 *
 * `background-clip: text` paints only inside the *element's* box, and the glow
 * layer wears a stroke several pixels wide — so at `inset: 0` the leftmost
 * glyph's stroke is clipped down its outer edge and the halo has a straight
 * side. The negative margin grows the border box while the matching padding
 * keeps the content box where it was, so the text does not move and the paint
 * has somewhere to go.
 */
export const TypedTitle: React.FC<
  TypewriterTiming & {
    text: string;
    /** Type size in px. */
    fontSize: number;
    /** The line box, in px — set it to the mark's own height to centre against it. */
    lineHeight: number;
    /** Colour of the readable layer. */
    color: string;
    /** Which stage the title is standing on — picks the ramp. Default `dark`. */
    theme?: Theme;
    fontWeight?: number;
    letterSpacing?: string;
    /** Strength of the halo, 0…1. Default 1. */
    glow?: number;
    style?: React.CSSProperties;
  }
> = ({
  text,
  fontSize,
  lineHeight,
  color,
  theme = "dark",
  fontWeight = 600,
  letterSpacing = "-0.005em",
  glow = 1,
  style,
  ...timing
}) => {
  /* Shared by both layers: they must wrap identically or they will not overlap. */
  const type: React.CSSProperties = {
    fontFamily: uiFontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight: `${lineHeight}px`,
    whiteSpace: "pre",
  };

  /*
    The halo is the theme's own ramp. On the light stage that is the dimmed
    re-cut — the dark stops are chosen to clear 4.5:1 against near-black and
    glow off nothing at all on 99%-lightness paper.
  */
  const ramp = `linear-gradient(96deg, ${themeRainbowStops(theme)})`;
  /* Heavier on the dark stage, where a halo has somewhere to be seen. */
  const strength = glow * (theme === "dark" ? 1 : 0.62);

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {strength > 0 ? (
        <div
          aria-hidden
          style={{
            ...type,
            position: "absolute",
            inset: 0,
            margin: "-0.16em",
            padding: "0.16em",
            backgroundImage: ramp,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            WebkitTextStrokeWidth: fontSize * 0.075,
            WebkitTextStrokeColor: "transparent",
            filter: `blur(${Math.round(fontSize * 0.14)}px)`,
            opacity: strength,
          }}
        >
          <Typewriter {...timing} text={text} caret="none" />
        </div>
      ) : null}

      <div style={{ ...type, position: "relative", color }}>
        <Typewriter {...timing} text={text} caret="bar" hideCursorWhenDone={false} />
      </div>
    </div>
  );
};
