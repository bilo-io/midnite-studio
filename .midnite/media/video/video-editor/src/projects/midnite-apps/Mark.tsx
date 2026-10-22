import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { uiFontFamily } from "../../shared/fonts";
import { useStage } from "../../shared/golive/stage";
import { MidniteWordmark } from "../../shared/MidniteWordmark";
import { BRAND_DARK } from "../../shared/neon-hud/skin";
import * as BED from "./energy-bed";
import type { CutId } from "./cuts";

/**
 * The one mark, from the first frame to the last — the go-live promo's
 * travelling mark (`projects/midnite/marketing/001-golive-promo/Promo.tsx`),
 * on this episode's stations.
 *
 * It stands at the head of whatever title is on screen: left of a HUD
 * headline's first character, a chapter title's, each half of the statement's,
 * in the slugs' caption line. On each cut it flies to the next one, so it
 * reads as one object being carried through the film rather than a logo
 * redrawn per scene. For the breath it is drawn to the centre, big, while the
 * motes implode onto it; for the end it goes back to the centre and the name
 * unfurls out of it into the lockup.
 *
 * It opens and closes on the same picture — the mark alone at `HOME`, in the
 * middle of the dark stage — so the film loops: the first line is spoken over
 * it before it flies to the first title, and after the lockup the name folds
 * back into it and it settles at `HOME` again. No fade at either end, for the
 * same reason.
 *
 * And it is a loudspeaker throughout: `thump` (where the cone is), `punch`
 * (the strike) and `bands` (the spectrum ring) are the cut's own music, baked
 * per frame by `scripts/make-track-envelope.mjs` into `energy-*.ts`. Driven
 * harder at the breath and over the lockup, as the promo does.
 */

export type Station = {
  /** Composition frame the mark starts flying here. */
  at: number;
  /** Centre of the crescent, in stage pixels. */
  x: number;
  y: number;
  /** The mark's height. */
  size: number;
  /** Frames the flight takes; `FLY` unless a journey is the beat itself. */
  fly?: number;
  /** Extra drive on the cone while the mark is at this station (1 = none). */
  drive?: number;
};

/** Frames the mark takes to fly between two stations on a cut: under a beat at either tempo. */
export const FLY = 10;
/** Space between the mark and the first character of a title, as a fraction of the mark. */
const GAP = 0.3;
/** The name's width as a multiple of the mark's height — measured for the promo's lockup. */
const NAME_WIDTH = 4.29;
/** Frames the name takes to unfurl, and to fold back in. */
export const UNFURL = 16;
/** Where the film starts and ends: the mark alone, centred. */
export const HOME = { x: 960, y: 540, size: 220 } as const;

const ENERGY = { bed: BED } as const;

/* ── Where a title starts ─────────────────────────────────────────────────── */

let ctx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

/**
 * The rendered width of one line of type. Measured in the page's own canvas,
 * after the fonts are loaded (`shared/fonts.ts` holds the render until they
 * are), with the line's letter-spacing added per character as CSS does.
 */
export const textWidth = (text: string, size: number, weight: number, letterSpacing = 0): number => {
  const key = `${weight}|${size}|${letterSpacing}|${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  ctx ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.6;
  ctx.font = `${weight} ${size}px ${uiFontFamily}`;
  const width = ctx.measureText(text).width + letterSpacing * size * [...text].length;
  widths.set(key, width);
  return width;
};

/** A station left of a centred block of type `width` wide whose middle is at `y`. */
export const headOf = (at: number, width: number, y: number, size: number, extra: Partial<Station> = {}): Station => ({
  at,
  x: 960 - width / 2 - GAP * size - size / 2,
  y,
  size,
  ...extra,
});

/** The HUD headline (`neon-hud/Headline.tsx` inside `Scene`): 92px payoff, 82% setup, 150px down. */
export const headlineStation = (
  at: number,
  h: { a: string; b?: string; layout?: "stack" | "inline" },
): Station => {
  const size = 92;
  const weight = BRAND_DARK.headWeight;
  const wa = textWidth(h.a.toUpperCase(), h.layout === "inline" ? size : size * 0.82, weight, 0.02);
  const wb = h.b ? textWidth(h.b.toUpperCase(), size, weight, 0.02) : 0;
  if (h.layout === "inline") return headOf(at, wa + (h.b ? 0.38 * size + wb : 0), 150 + (size * 1.05) / 2, 96);
  const height = size * 0.82 * 1.05 + (h.b ? size * 0.02 + size * 1.05 : 0);
  return headOf(at, Math.max(wa, wb), 150 + height / 2, 124);
};

/* ── The mark ─────────────────────────────────────────────────────────────── */

const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Mark: React.FC<{
  cut: CutId;
  stations: readonly Station[];
  /** Frame the name starts unfurling out of the mark, for the lockup. */
  lockupAt: number;
  /** Frame the name starts folding back in, for the return to `HOME`. */
  foldAt: number;
  qualifier: string;
}> = ({ cut, stations, lockupAt, foldAt, qualifier }) => {
  const frame = useCurrentFrame();
  const { themeMixAt } = useStage();
  const energy = ENERGY[cut];

  /* Each journey blends on top of the last, so a frame is "wherever the latest flight has got to". */
  let x = stations[0].x;
  let y = stations[0].y;
  let size = stations[0].size;
  let drive = stations[0].drive ?? 1;
  for (const s of stations.slice(1)) {
    const t = interpolate(frame, [s.at, s.at + (s.fly ?? FLY)], [0, 1], ease);
    if (t <= 0) break;
    x += (s.x - x) * t;
    y += (s.y - y) * t;
    size += (s.size - size) * t;
    drive += ((s.drive ?? 1) - drive) * t;
  }

  /* The qualifier is typed after the name unfurls, and erased before it folds. */
  const reveal = interpolate(frame, [lockupAt, lockupAt + UNFURL, foldAt, foldAt + UNFURL], [0, 1, 1, 0], ease);
  const typed = Math.floor((frame - lockupAt - UNFURL) * 0.8);
  const erased = Math.floor((foldAt - frame) * 0.8);
  const qualifierChars = Math.max(0, Math.min(qualifier.length, typed, erased));
  /* The lockup is centred as a pair, so while the name is out the crescent sits left of `x` by half of it. */
  const markX = x - (reveal * size * NAME_WIDTH) / 2;
  const themeMix = themeMixAt(frame, markX);
  const aura = interpolate(size, [50, 240], [0.35, 1], clamp);
  const pump = (v: number) => Math.min(1, v * drive);

  const props = {
    size,
    qualifier,
    reveal,
    qualifierChars,
    caret: frame >= lockupAt + UNFURL && frame < foldAt,
    aura,
    thump: pump(energy.thumpAt(frame)),
    punch: pump(energy.punchAt(frame)),
    bands: energy.bandsAt(frame),
  } as const;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translate(${x - 960}px, ${y - 540}px)`,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "relative" }}>
        <div style={{ opacity: 1 - themeMix }}>
          <MidniteWordmark {...props} theme="dark" />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: themeMix }}>
          <MidniteWordmark {...props} theme="light" />
        </div>
      </div>
    </AbsoluteFill>
  );
};
