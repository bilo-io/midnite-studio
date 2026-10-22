import { interpolate } from "remotion";

import { useDrawing } from "./boil";
import { between, blobPath, openPath, rand, type Pt } from "./noise";
import { INK, STAGE } from "./palette";

/**
 * The marks every scene is drawn with. All of them are SVG, sized in stage
 * pixels (1920×1080), and meant to sit inside one full-frame `<svg>`.
 */

const { width: W, height: H } = STAGE;

/* ── Grounds ─────────────────────────────────────────────────────────────── */

/**
 * Cream paper: a flat fill, a fixed grain and a few vertical fibres. The paper
 * does not boil — only what is drawn on it does — so its grain is seeded once.
 */
export const Paper: React.FC<{ id: string; tint?: string }> = ({ id, tint }) => (
  <>
    <defs>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves={2} seed={4} />
        <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0.16 0" />
      </filter>
      {tint ? (
        <linearGradient id={`${id}-tint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint} />
          <stop offset="0.7" stopColor={INK.paper} />
        </linearGradient>
      ) : null}
    </defs>
    <rect width={W} height={H} fill={tint ? `url(#${id}-tint)` : INK.paper} />
    <rect width={W} height={H} filter={`url(#${id})`} />
  </>
);

/** The void. A flat near-black; chalk and scratches supply the texture. */
export const Void: React.FC = () => <rect width={W} height={H} fill={INK.void} />;

/**
 * Black wood grain: long wavy horizontal streaks a shade off black, re-traced
 * every drawing so the surface flickers like a scanned plate.
 */
export const WoodGrain: React.FC<{ seed: string }> = ({ seed }) => {
  const d = useDrawing();
  return (
    <g>
      <rect width={W} height={H} fill={INK.void} />
      {Array.from({ length: 90 }, (_, i) => {
        const y = (i / 90) * H + between(-6, 6, seed, "y", i);
        const amp = between(2, 14, seed, "amp", i);
        const pts: Pt[] = Array.from({ length: 9 }, (_, k) => [
          (k / 8) * W,
          y + Math.sin(k * 0.9 + i) * amp + between(-1.5, 1.5, seed, i, k, d % 3),
        ]);
        return (
          <path
            key={i}
            d={openPath(pts)}
            fill="none"
            stroke="#2a2622"
            strokeWidth={between(0.6, 3, seed, "w", i)}
            opacity={between(0.25, 0.8, seed, "o", i, d % 3)}
          />
        );
      })}
    </g>
  );
};

/**
 * Scratches: thin lines that flicker on and off each drawing. Vertical reads as
 * rain or film damage; horizontal reads as a dry brush dragged across the frame.
 */
export const Scratches: React.FC<{
  seed: string;
  count?: number;
  color?: string;
  dir?: "vertical" | "horizontal";
  opacity?: number;
  /** Limit them to a band: [from, to] along the cross axis, in px. */
  span?: readonly [number, number];
}> = ({ seed, count = 40, color = INK.chalk, dir = "vertical", opacity = 0.35, span }) => {
  const d = useDrawing();
  const along = dir === "vertical" ? H : W;
  const [lo, hi] = span ?? [0, dir === "vertical" ? W : H];
  return (
    <g stroke={color} strokeLinecap="round">
      {Array.from({ length: count }, (_, i) => {
        if (rand(seed, "on", i, d) < 0.35) return null;
        const c = between(lo, hi, seed, "c", i, d);
        const a = between(-0.2, 0.9, seed, "a", i, d) * along;
        const len = between(0.04, 0.35, seed, "l", i, d) * along;
        const [x1, y1, x2, y2] = dir === "vertical" ? [c, a, c + len * 0.02, a + len] : [a, c, a + len, c + len * 0.004];
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={between(0.6, 2.4, seed, "w", i)}
            opacity={opacity * between(0.3, 1, seed, "o", i, d)}
          />
        );
      })}
    </g>
  );
};

/* ── Ink ─────────────────────────────────────────────────────────────────── */

/** One wet blob of ink. Its edge drifts with the drawing number. */
export const InkBlob: React.FC<{
  cx: number;
  cy: number;
  r: number;
  seed: string;
  fill?: string;
  wobble?: number;
  squash?: number;
  rotate?: number;
  opacity?: number;
}> = ({ fill = INK.ink, opacity = 1, ...spec }) => {
  const t = useDrawing();
  if (spec.r <= 0.5) return null;
  return <path d={blobPath({ ...spec, t })} fill={fill} opacity={opacity} />;
};

/**
 * A marbled pool: a black blob with accent blobs and rings churning inside it.
 * The inner blobs jump to new places every drawing — not tweened — which is
 * what the reference's liquid does, and why it reads as boiling paint.
 */
export const MarbledPool: React.FC<{
  cx: number;
  cy: number;
  r: number;
  seed: string;
  accent: string;
  wobble?: number;
}> = ({ cx, cy, r, seed, accent, wobble = 0.1 }) => {
  const d = useDrawing();
  if (r <= 1) return null;
  return (
    <g>
      <InkBlob cx={cx} cy={cy} r={r} seed={seed} wobble={wobble} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = between(0, Math.PI * 2, seed, "a", i, d);
        const dist = between(0, 0.62, seed, "d", i, d) * r;
        const rr = between(0.08, 0.26, seed, "r", i) * r;
        const x = cx + Math.cos(a) * dist;
        const y = cy + Math.sin(a) * dist;
        return rand(seed, "ring", i) < 0.35 ? (
          <circle key={i} cx={x} cy={y} r={rr} fill="none" stroke={accent} strokeWidth={rr * 0.35} />
        ) : (
          <InkBlob key={i} cx={x} cy={y} r={rr} seed={`${seed}-in${i}`} fill={accent} wobble={0.2} />
        );
      })}
    </g>
  );
};

/**
 * Droplets flung from a point. `progress` 0→1 is the throw; past 1 they have
 * landed and stay. Drops further out are smaller, and the fast ones stretch
 * along their path, the way a flicked brush leaves them.
 */
export const Splatter: React.FC<{
  x: number;
  y: number;
  seed: string;
  progress: number;
  /** Radians: the direction of the throw. */
  angle?: number;
  spread?: number;
  reach?: number;
  count?: number;
  colors?: readonly string[];
  size?: number;
}> = ({ x, y, seed, progress, angle = 0, spread = 0.8, reach = 420, count = 34, colors = [INK.ink], size = 14 }) => {
  if (progress <= 0) return null;
  const p = Math.min(1, progress);
  const eased = 1 - (1 - p) ** 3;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const a = angle + between(-spread, spread, seed, "a", i);
        const far = between(0.15, 1, seed, "d", i) ** 0.7;
        const dist = eased * far * reach;
        const r = size * between(0.25, 1, seed, "r", i) * (1.15 - far * 0.8);
        const stretch = 1 + (1 - p) * far * 3;
        return (
          <ellipse
            key={i}
            cx={x + Math.cos(a) * dist}
            cy={y + Math.sin(a) * dist}
            rx={r * stretch}
            ry={r}
            transform={`rotate(${((a * 180) / Math.PI).toFixed(1)} ${(x + Math.cos(a) * dist).toFixed(1)} ${(y + Math.sin(a) * dist).toFixed(1)})`}
            fill={colors[i % colors.length]}
          />
        );
      })}
    </g>
  );
};

/** A stroke that draws itself on: `progress` 0→1 along the path's own length. */
export const DrawOn: React.FC<{
  d: string;
  progress: number;
  stroke?: string;
  width?: number;
  opacity?: number;
}> = ({ d, progress, stroke = INK.ink, width = 4, opacity = 1 }) => {
  if (progress <= 0) return null;
  return (
    <path
      d={d}
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - Math.min(1, progress)}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
};

/**
 * A dry-brush band painted left to right, its head at `head`. Ragged top and
 * bottom edges, bristle streaks running ahead of the head, and thin gaps of
 * paper left inside the body where the brush ran dry.
 */
export const BrushBand: React.FC<{
  seed: string;
  y: number;
  height: number;
  head: number;
  start?: number;
  color?: string;
  gap?: string;
}> = ({ seed, y, height, head, start = -60, color = INK.ink, gap = INK.paper }) => {
  if (head <= start) return null;
  const top = y - height / 2;
  const bottom = y + height / 2;
  const step = 28;
  const n = Math.max(2, Math.ceil((head - start) / step));
  const topPts: Pt[] = Array.from({ length: n + 1 }, (_, i) => [
    start + ((head - start) * i) / n,
    top + between(-5, 6, seed, "t", Math.round((start + ((head - start) * i) / n) / step)),
  ]);
  const botPts: Pt[] = Array.from({ length: n + 1 }, (_, i) => [
    head - ((head - start) * i) / n,
    bottom + between(-6, 5, seed, "b", Math.round((head - ((head - start) * i) / n) / step)),
  ]);
  const body = `M${[...topPts, [head + 10, y] as Pt, ...botPts].map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")}Z`;
  return (
    <g>
      <path d={body} fill={color} />
      {Array.from({ length: 30 }, (_, i) => {
        const sy = top + between(0, 1, seed, "sy", i) * height;
        const len = between(20, 180, seed, "sl", i);
        return (
          <rect
            key={`s${i}`}
            x={head - 10}
            y={sy}
            width={len}
            height={between(1, 4, seed, "sh", i)}
            fill={color}
            opacity={between(0.3, 0.95, seed, "so", i)}
          />
        );
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const gy = top + between(0.06, 0.94, seed, "gy", i) * height;
        const gx = start + between(0, 0.6, seed, "gx", i) * (head - start);
        return (
          <rect
            key={`g${i}`}
            x={gx}
            y={gy}
            width={between(0.2, 0.5, seed, "gw", i) * (head - start)}
            height={between(0.6, 2, seed, "gh", i)}
            fill={gap}
            opacity={between(0.12, 0.35, seed, "go", i)}
          />
        );
      })}
    </g>
  );
};

/**
 * A small ink bug, the kind that wanders across a page: an oval body, a head
 * and six tick legs that swap stance every drawing. It faces `angle` (radians).
 */
export const Critter: React.FC<{ x: number; y: number; angle?: number; size?: number; color?: string }> = ({
  x,
  y,
  angle = 0,
  size = 1,
  color = INK.ink,
}) => {
  const d = useDrawing();
  const stance = d % 2 === 0 ? 1 : -1;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)}) scale(${size})`}>
      {[-1, 0, 1].map((k) =>
        [-1, 1].map((side) => (
          <line
            key={`${k}${side}`}
            x1={k * 7}
            y1={0}
            x2={k * 7 + 5 * stance * side * (k === 0 ? -1 : 1)}
            y2={side * 15}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )),
      )}
      <ellipse cx={0} cy={0} rx={15} ry={9} fill={color} />
      <circle cx={17} cy={0} r={5} fill={color} />
    </g>
  );
};

/**
 * Chalk hatching inside a shape: parallel strokes at `angle`, each appearing at
 * its own moment as `progress` runs 0→1, so a form builds up out of the void
 * the way the reference's end credits do. Denser near `lit` (0–1 across the
 * shape), sparser in shadow.
 */
export const Hatching: React.FC<{
  id: string;
  /** The shape to fill, as a path. */
  d: string;
  bounds: { x: number; y: number; w: number; h: number };
  progress: number;
  seed: string;
  angle?: number;
  color?: string;
  spacing?: number;
}> = ({ id, d, bounds, progress, seed, angle = -0.5, color = INK.chalk, spacing = 9 }) => {
  const drawing = useDrawing();
  const { x, y, w, h } = bounds;
  const diag = Math.hypot(w, h);
  const n = Math.ceil(diag / spacing);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={d} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {Array.from({ length: n }, (_, i) => {
          const at = rand(seed, "at", i) * 0.8;
          const local = interpolate(progress, [at, at + 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (local <= 0) return null;
          const lit = 1 - i / n;
          if (rand(seed, "keep", i) > 0.35 + lit * 0.65) return null;
          const off = -diag / 2 + i * spacing + between(-2, 2, seed, i, drawing % 3);
          const len = diag * local;
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const px = cx - uy * off - (ux * diag) / 2;
          const py = cy + ux * off - (uy * diag) / 2;
          return (
            <line
              key={i}
              x1={px}
              y1={py}
              x2={px + ux * len}
              y2={py + uy * len}
              stroke={color}
              strokeWidth={between(1, 2.6, seed, "w", i)}
              opacity={between(0.45, 1, seed, "o", i)}
            />
          );
        })}
      </g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5 * Math.min(1, progress * 2)} />
    </g>
  );
};
