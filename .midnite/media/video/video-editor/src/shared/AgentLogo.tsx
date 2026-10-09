import { Img, staticFile } from "remotion";

import { AGENT_ACCENT } from "./agentAccents";

/**
 * The coding agents midnite drives, keyed exactly as the app's own roster keys
 * them (`midnite-studio/packages/app/src/components/icons/index.ts`) — so a
 * video naming `openclaude` and the app naming `openclaude` mean one thing.
 *
 * The marks in `assets/logos/agents/` were rendered from those same components
 * rather than re-sourced from each vendor, which is what keeps them a matched
 * set: one grid, one optical weight, one 24×24 box.
 */

/** The agents midnite's roster actually ships, in the order the app lists them. */
export const ROSTER_KEYS = [
  "claude",
  "cursor",
  "antigravity",
  "codex",
  "copilot",
  "openclaude",
  "opencode",
  "kilo",
  "aider",
  "cline",
  "grok",
] as const;

/** …plus the marks carried for agents a user can name in `agents.json`. */
export const EXTRA_KEYS = ["gemini", "anthropic", "mistral", "ollama"] as const;

export const AGENT_KEYS = [...ROSTER_KEYS, ...EXTRA_KEYS] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

/**
 * The marks that carry real art rather than one paint value — Antigravity's
 * blurred spectrum masked to its peak, and Aider's green bit-art `a`. Neither
 * has a `currentColor` to re-fill or a single hue to swap, and flattening
 * either would destroy the thing that makes it that mark, so they have no
 * derived cuts at all. Asking for one silently 404s, so don't.
 *
 * Aider is here because its mark *changed*: the previous one was a plain
 * `currentColor` triangle, and the cut made from it, `aider-white.svg`, went on
 * sitting on disk being the file this component loaded. The roster drew a logo
 * the brand had stopped using and every check passed. `make-logo-cuts.mjs` now
 * fails on a cut nothing generates, which is the half of that bug that was
 * invisible.
 */
const SELF_COLOURED: ReadonlySet<string> = new Set(["antigravity", "aider"]);

/**
 * The agents with a brand accent in midnite's roster, and therefore a
 * `-color` cut on disk (see `scripts/make-logo-cuts.mjs`, which is where the
 * colours themselves live — this is only the list of who has one).
 *
 * `EXTRA_KEYS` are deliberately absent: the roster carries no accent for them,
 * so there is nothing to copy and inventing one would put a colour in a midnite
 * video that midnite never chose. They fall back to white.
 */
const HAS_ACCENT: ReadonlySet<string> = new Set([
  "claude",
  "cursor",
  "codex",
  "copilot",
  "openclaude",
  "opencode",
  "kilo",
  "cline",
  "grok",
]);

/**
 * Marks that also carry an **ink** cut, for a mark drawn on the light stage.
 *
 * One entry, and it is not an oversight. Every other accent in the roster is a
 * real hue that reads on white as well as it does on near-black; Grok's is
 * white, because its brand is black-or-white and white is the half that works
 * on midnite's page. On the light stage that substitution is not a subtle
 * mistake — it is a blank space where the logo should be, which is exactly what
 * a still of the roster deal rendered before this existed.
 */
const HAS_INK: ReadonlySet<string> = new Set(["grok"]);

/** Which cut of a mark to draw. */
export type AgentTone =
  /** The agent's own brand accent, falling back to white where it has none. */
  | "color"
  /** Flat white — for a row that should read as one set rather than many brands. */
  | "white"
  /**
   * `color`, except where the accent is white — for a mark on the light stage.
   * Only Grok has anything to swap, so this is `color` for everyone else.
   */
  | "ink";

/** Path to an agent's mark, in the requested tone. */
export const agentLogoSrc = (agent: AgentKey, tone: AgentTone = "color"): string => {
  if (SELF_COLOURED.has(agent)) return staticFile(`logos/agents/${agent}.svg`);
  if (tone === "ink" && HAS_INK.has(agent)) return staticFile(`logos/agents/${agent}-ink.svg`);
  const cut = tone !== "white" && HAS_ACCENT.has(agent) ? "-color" : "-white";
  return staticFile(`logos/agents/${agent}${cut}.svg`);
};

/**
 * One agent's mark at a given size.
 *
 * Never the canonical `currentColor` cut: these load through `<Img>`, which
 * gives the file no page to inherit a colour from, so that cut renders black.
 */
export const AgentLogo: React.FC<{
  agent: AgentKey;
  /** Box size in px — the marks are square on a 24×24 grid. Default 96. */
  size?: number;
  tone?: AgentTone;
  /**
   * A band of light crossing the mark: 0 is off its left edge, 1 off its right.
   * Values outside that are legal and simply park it out of sight; `undefined`
   * draws nothing at all.
   *
   * **In the agent's own colour, and clipped to the mark rather than its box.**
   * The band is painted on an overlay whose CSS mask is the same SVG the mark is
   * drawn from, so what lights up is the glyph and not a rectangle passing over
   * it — and it is tinted with `AGENT_ACCENT`, because eleven marks flashing the
   * same violet is eleven marks flashing violet, where eleven marks each
   * flashing their own brand is a roster.
   *
   * White where the roster carries no accent, which is the same fallback the
   * `-color` cut takes.
   */
  shimmer?: number;
  style?: React.CSSProperties;
}> = ({ agent, size = 96, tone = "color", shimmer, style }) => {
  const src = agentLogoSrc(agent, tone);
  const image: React.CSSProperties = { width: size, height: size, objectFit: "contain" };

  if (shimmer === undefined) return <Img src={src} style={{ ...image, ...style }} />;

  /* The same placement `ShimmerLine` uses: stops outside 0–100% are legal. */
  const centre = shimmer * 140 - 20;
  const light = AGENT_ACCENT[agent] ?? "#ffffff";

  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <Img src={src} style={image} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          backgroundImage:
            `linear-gradient(104deg, transparent ${centre - 30}%, ` +
            `${light}66 ${centre - 11}%, #ffffff ${centre}%, ` +
            `${light}66 ${centre + 11}%, transparent ${centre + 30}%)`,
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
};
