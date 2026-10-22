import { random } from "remotion";

/**
 * Deterministic randomness and the blob geometry every ink shape is built on.
 * Everything here is a pure function of its arguments, so a frame renders the
 * same on every worker.
 */

export const rand = (...key: (string | number)[]): number => random(key.join(":"));
export const between = (lo: number, hi: number, ...key: (string | number)[]): number =>
  lo + (hi - lo) * rand(...key);

export type Pt = readonly [number, number];

export type BlobSpec = {
  cx: number;
  cy: number;
  r: number;
  seed: string;
  /** How far the edge strays from a circle, as a fraction of `r`. */
  wobble?: number;
  /** The drawing number: the edge drifts with it, so a held blob still lives. */
  t?: number;
  squash?: number;
  /** Radians. */
  rotate?: number;
  points?: number;
};

/**
 * A closed blob: a circle whose radius is a sum of four slow sine harmonics of
 * the angle. Harmonics rather than per-point noise, because neighbouring points
 * then move together and the outline reads as liquid, not as a jittered polygon.
 */
export const blobPoints = ({
  cx,
  cy,
  r,
  seed,
  wobble = 0.18,
  t = 0,
  squash = 1,
  rotate = 0,
  points = 56,
}: BlobSpec): Pt[] => {
  const harmonics = [2, 3, 5, 7].map((k, i) => ({
    k,
    a: (wobble * between(0.4, 1, seed, "a", i)) / Math.sqrt(i + 1),
    p: between(0, Math.PI * 2, seed, "p", i),
    s: between(-0.09, 0.09, seed, "s", i),
  }));
  const c = Math.cos(rotate);
  const s = Math.sin(rotate);
  return Array.from({ length: points }, (_, i) => {
    const th = (i / points) * Math.PI * 2;
    let m = 1;
    for (const h of harmonics) m += h.a * Math.sin(h.k * th + h.p + h.s * t);
    const x = Math.cos(th) * r * m;
    const y = Math.sin(th) * r * m * squash;
    return [cx + x * c - y * s, cy + x * s + y * c] as const;
  });
};

const f = (n: number) => n.toFixed(1);

/** A smooth closed path through `pts`, curving through the midpoints. */
export const closedPath = (pts: readonly Pt[]): string => {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
};

/** An open smooth path through `pts`. */
export const openPath = (pts: readonly Pt[]): string => {
  if (pts.length < 3) return `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const m: Pt = [(p[0] + pts[i + 1][0]) / 2, (p[1] + pts[i + 1][1]) / 2];
    d += ` Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
};

export const blobPath = (spec: BlobSpec): string => closedPath(blobPoints(spec));

/** An arc of a wobbly ring, as an open path: the stroke the vortex is made of. */
export const arcPath = (
  cx: number,
  cy: number,
  r: number,
  from: number,
  sweep: number,
  seed: string,
  wobble = 0.06,
): string => {
  const n = Math.max(6, Math.round(Math.abs(sweep) * 10));
  return openPath(
    Array.from({ length: n + 1 }, (_, i) => {
      const th = from + (sweep * i) / n;
      const m = 1 + wobble * Math.sin(th * 3 + between(0, 6, seed));
      return [cx + Math.cos(th) * r * m, cy + Math.sin(th) * r * m] as const;
    }),
  );
};
