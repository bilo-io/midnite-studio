import { Img, staticFile } from "remotion";

/**
 * The forges midnite connects to — the hosts a repository actually lives on, as
 * opposed to the agents that work in it (`AgentLogo`).
 *
 * These are vendor files, supplied rather than derived: each one is the mark as
 * its owner publishes it, at its own viewBox, carrying its own colour. That is
 * the opposite of `assets/logos/agents/`, where every mark was re-rendered from
 * midnite-studio's own icon components onto one 24×24 grid so the row reads as
 * a matched set. A row of forges is not a matched set and should not pretend to
 * be: GitLab's tanuki is four oranges, Bitbucket's is a blue gradient, Azure
 * DevOps' is a blue ramp, and flattening them to one palette would take away
 * the only thing that makes each one recognisable at a glance.
 *
 * What that costs is optical weight. A mark drawn to fill a 32-unit box and one
 * drawn inside an 18-unit box with its own margin do not read as the same size
 * at the same `size`, so each one carries a `scale` measured against the others
 * rather than being trusted to its own viewBox — see `TRIM` below.
 */

/** The forges, in the order the outro names them. */
export const FORGE_KEYS = ["github", "gitlab", "bitbucket", "azure-devops"] as const;

export type ForgeKey = (typeof FORGE_KEYS)[number];

/** What each one is called on screen. */
export const FORGE_LABEL: Record<ForgeKey, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  "azure-devops": "Azure DevOps",
};

/**
 * Per-mark size correction, as a multiple of the requested `size`.
 *
 * Measured off a rendered row rather than computed from the viewBoxes: what
 * matters is how big the *ink* looks, and these four marks fill their boxes
 * very differently. GitHub's octocat is a solid disc that fills its 98×96 box
 * edge to edge and so reads large; Azure DevOps' is a thin outlined shape
 * inside an 18×18 box with a unit of padding on every side and reads small at
 * the same nominal height.
 *
 * 1 means "already right". Only change one of these against a still of the
 * whole row — a mark adjusted on its own always looks fine on its own.
 */
const TRIM: Record<ForgeKey, number> = {
  github: 0.9,
  gitlab: 1,
  bitbucket: 0.96,
  "azure-devops": 1.12,
};

/**
 * Which cut of a forge mark to draw.
 *
 * `color` is the vendor file. `white` exists for GitHub alone and is generated
 * by `scripts/make-logo-cuts.mjs`, because GitHub's mark is flat `fill="black"`
 * by design — which on midnite's near-black stage is not a subtle mark, it is
 * no mark. Asking for `white` on any other forge falls back to its colour cut
 * rather than 404ing, since the other three are legible on both stages.
 */
export type ForgeTone = "color" | "white";

const HAS_WHITE: ReadonlySet<string> = new Set(["github"]);

export const forgeLogoSrc = (forge: ForgeKey, tone: ForgeTone = "color"): string =>
  staticFile(`logos/git/logo-${forge}${tone === "white" && HAS_WHITE.has(forge) ? "-white" : ""}.svg`);

export const ForgeLogo: React.FC<{
  forge: ForgeKey;
  /** Box height in px, before the per-mark `TRIM` correction. Default 96. */
  size?: number;
  tone?: ForgeTone;
  /**
   * A band of light crossing the mark: 0 is off its left edge, 1 off its right.
   * Values outside that are legal and simply park it out of sight; `undefined`
   * draws nothing at all.
   *
   * **Clipped to the mark, not to its box.** The band is painted on an overlay
   * whose CSS mask is the same SVG the mark is drawn from, so what lights up is
   * the octocat or the tanuki rather than a rectangle passing over it. That is
   * the whole difference between "the logo shimmered" and "a white bar went
   * across the screen"; these are vendor files with transparent grounds, which
   * is what makes the mask work without anything being authored for it.
   */
  shimmer?: number;
  style?: React.CSSProperties;
}> = ({ forge, size = 96, tone = "color", shimmer, style }) => {
  const box = size * TRIM[forge];
  const src = forgeLogoSrc(forge, tone);

  /* The same placement `ShimmerLine` uses: stops outside 0–100% are legal. */
  const centre = (shimmer ?? 0) * 140 - 20;
  const mask = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  } as const;

  /*
    How much the whole mark is lit as the band passes over its middle.

    The band alone is not enough on every mark. Clipped to GitHub's octocat —
    which is drawn flat white on this stage — a white band is white on white and
    nothing happens at all, while on Bitbucket's blue it is obvious. A bloom
    around the mark works on both, because what it changes is the *ground*
    rather than the ink, so the two together read as one light crossing the row
    rather than as two of the four marks reacting to it.
  */
  const lit = shimmer === undefined ? 0 : Math.max(0, 1 - Math.abs(shimmer - 0.5) * 2.4);

  return (
    /*
      The outer box is the *uncorrected* size and the image is centred in it, so
      a row of these lays out on one rhythm however much each mark was trimmed.
      Scaling the box itself would make the gaps between marks uneven.
    */
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: box,
          height: box,
          filter: lit > 0 ? `drop-shadow(0 0 ${10 + lit * 26}px rgba(255,255,255,${lit * 0.55}))` : undefined,
        }}
      >
        <Img src={src} style={{ width: box, height: box, objectFit: "contain" }} />
        {shimmer === undefined ? null : (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              ...mask,
              backgroundImage:
                `linear-gradient(104deg, transparent ${centre - 26}%, ` +
                `rgba(255,255,255,0.35) ${centre - 9}%, rgba(255,255,255,0.92) ${centre}%, ` +
                `rgba(255,255,255,0.35) ${centre + 9}%, transparent ${centre + 26}%)`,
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>
    </div>
  );
};
