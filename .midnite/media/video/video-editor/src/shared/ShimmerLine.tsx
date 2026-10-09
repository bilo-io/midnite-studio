import { THEME, type Theme, themeRainbowStops } from "./brand";

/**
 * A line of type with the brand ramp glowing off its edges, and a highlight
 * that travels across it.
 *
 * Three copies of the same string, stacked and sharing one typographic box, so
 * they cannot drift apart:
 *
 *   1. **glow** — the ramp, clipped to the glyphs *and their stroke*, blurred.
 *      What escapes the letterforms is the halo; the stroke is what gives it
 *      something to escape from, which is why the width is on this layer and
 *      not only on the one you can read.
 *   2. **body** — the line itself, solid, with a thin brand-coloured rim. This
 *      is the layer that has to stay legible, so it is not wearing a gradient:
 *      the ramp clipped to 38px type reads as grey-purple mush over a dark
 *      stage, which is why the pilot's tagline was made solid in the first
 *      place. The glow underneath is how the colour gets in.
 *   3. **shimmer** — a narrow band of white, clipped to the same glyphs and
 *      swept across by `shimmer`. Narrow and part-transparent on purpose: a
 *      wide band would simply repaint the word.
 *
 * `background-clip: text` paints only inside the element's own box, so a face
 * whose ink overshoots its advances needs headroom — see `MidniteWordmark`,
 * which pays that tax for a script face. This is set in the UI face, whose ink
 * stays inside its box, so a little `padding` is enough.
 *
 * ── On the light stage it is the same object, dimmer ────────────────────────
 *
 * Two substitutions, and both are forced rather than stylistic. The ramp
 * becomes the light theme's re-cut of itself, because the dark stops are chosen
 * to clear 4.5:1 against near-black and are far too light to glow off anything
 * on 99%-lightness paper. And the travelling band drops from near-white to
 * about half of it: clipped to near-black type on white, a full-strength white
 * band does not read as light crossing the letters, it reads as the letters
 * being rubbed out.
 */
export const ShimmerLine: React.FC<{
  children: string;
  /**
   * Where the highlight is: 0 is off the left edge, 1 off the right. Values
   * outside that are fine and simply park it out of sight.
   */
  shimmer: number;
  /** Colour of the readable layer. */
  color: string;
  fontSize: number;
  fontWeight?: number;
  letterSpacing?: string;
  /** Thickness of the rim the glow comes off, in px. */
  stroke?: number;
  /** Which stage the line is standing on. Default `dark`. */
  theme?: Theme;
  /**
   * What colour the travelling band is.
   *
   *   white  a highlight — light crossing a surface. The default, and right
   *          when the line itself already carries the brand in its halo.
   *   brand  the ramp crossing the letterforms' *stroke*, which is a different
   *          statement: not "light passed over this" but "this is lit from
   *          inside". For a line that has to be the brand rather than wear it —
   *          the outro's forge names, where the mark beside each one is a
   *          vendor's colour and the type is the only midnite thing on screen.
   */
  band?: "white" | "brand";
  style?: React.CSSProperties;
}> = ({
  children,
  shimmer,
  color,
  fontSize,
  fontWeight = 500,
  letterSpacing = "0.01em",
  stroke = 1.6,
  theme = "dark",
  band: bandTone = "white",
  style,
}) => {
  /* Shared by all three layers: they must wrap identically or they will not overlap. */
  const type: React.CSSProperties = {
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    padding: "0 0.12em",
  };
  /* Layers 1 and 3 sit on top of layer 1's box, which is the one in flow. */
  const over: React.CSSProperties = { ...type, position: "absolute", inset: 0 };

  const ramp = `linear-gradient(96deg, ${themeRainbowStops(theme)})`;
  /* The rim the glow comes off — the stage's own violet at a tenth strength. */
  const rim = `${THEME[theme].RAINBOW[2]}66`;
  /* How bright the travelling band is allowed to get. See the note above. */
  const bandPeak = theme === "light" ? 0.52 : 0.95;

  /*
    The band's own colours. The white one dims on the light stage for the reason
    above; the brand one does not need to, because the light theme's ramp is
    already the re-cut that clears 4.5:1 on paper.
  */
  const stops = THEME[theme].RAINBOW;
  const wide =
    bandTone === "brand"
      ? ([stops[4], stops[1]] as const)
      : ([`rgba(255,255,255,${bandPeak})`, `rgba(255,255,255,${bandPeak * 0.42})`] as const);
  const tight =
    bandTone === "brand"
      ? ([stops[5], stops[2]] as const)
      : ([
          `rgba(255,255,255,${Math.min(1, bandPeak * 1.06)})`,
          `rgba(255,255,255,${bandPeak * 0.53})`,
        ] as const);

  /*
    The highlight is a band placed by moving its colour stops, not by sliding an
    oversized background under a fixed window.

    The second way is the obvious one and it does not work: with
    `background-size: 400%` and `background-position: X%`, the box shows the
    slice `[3X%, 3X% + 25%]` of the gradient, so a band at 43–57% is on screen
    only while X is between 6 and 19 — the first eighth of the sweep, after
    which the highlight is off in the part of the background nobody can see. The
    first render of this looked like the line was flickering rather than being
    crossed.

    Stops outside 0–100% are legal, so `centre` runs from -20 to 120 and the
    band enters and leaves cleanly.
  */
  const centre = shimmer * 140 - 20;
  const band = (peak: string, shoulder: string, width: number): string =>
    `linear-gradient(96deg, transparent ${centre - width}%, ${shoulder} ${centre - width / 3}%, ` +
    `${peak} ${centre}%, ${shoulder} ${centre + width / 3}%, transparent ${centre + width}%)`;

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <div
        aria-hidden
        style={{
          ...over,
          backgroundImage: ramp,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStrokeWidth: stroke * 2.2,
          WebkitTextStrokeColor: "transparent",
          filter: "blur(7px)",
          opacity: 0.95,
        }}
      >
        {children}
      </div>

      <div
        style={{
          ...type,
          position: "relative",
          color,
          WebkitTextStrokeWidth: stroke * 0.45,
          WebkitTextStrokeColor: rim,
        }}
      >
        {children}
      </div>

      {/*
        Two copies of the same band: a wide blurred one that lifts the glow as
        it passes, and a narrow crisp one that is the highlight itself. One of
        them alone reads as either a vague brightening or a hard white stripe;
        together they read as light crossing a surface.
      */}
      <div
        aria-hidden
        style={{
          ...over,
          backgroundImage: band(wide[0], wide[1], 16),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStrokeWidth: stroke * 2.4,
          WebkitTextStrokeColor: "transparent",
          filter: "blur(5px)",
        }}
      >
        {children}
      </div>

      <div
        aria-hidden
        style={{
          ...over,
          backgroundImage: band(tight[0], tight[1], 7),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStrokeWidth: stroke * 1.4,
          WebkitTextStrokeColor: "transparent",
        }}
      >
        {children}
      </div>
    </div>
  );
};
