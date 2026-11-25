import { z } from 'zod';

/**
 * The scatter brush's sampler (Phase 139 Theme H): pure, seeded and zod-only, so the editor's brush and the MCP
 * `game_level_scatter` op draw the same points from the same options.
 */
const SourceWeight = z.number().positive().default(1);

export const ScatterSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('model'), name: z.string().min(1).max(200), weight: SourceWeight }),
  z.object({ kind: z.literal('prefab'), name: z.string().min(1).max(200), weight: SourceWeight }),
  z.object({ kind: z.literal('type'), type: z.string().min(1).max(100), weight: SourceWeight }),
]);
export type ScatterSource = z.infer<typeof ScatterSourceSchema>;

export const ScatterOptionsSchema = z.object({
  sources: z.array(ScatterSourceSchema).min(1).max(16),
  /** Brush radius, px. */
  radius: z.number().positive().max(10_000),
  /** Objects per 100 x 100 px. */
  density: z.number().min(0.01).max(100),
  /** Minimum distance between two scattered objects, px. */
  spacing: z.number().nonnegative().max(1000),
  scale: z.tuple([z.number().positive(), z.number().positive()]).default([1, 1]),
  rotation: z.tuple([z.number(), z.number()]).default([0, 360]),
  seed: z.number().int().nonnegative(),
});
export type ScatterOptions = z.input<typeof ScatterOptionsSchema>;
export type ScatterOptionsParsed = z.infer<typeof ScatterOptionsSchema>;

/** A stroke stops adding at this many objects. */
export const SCATTER_STROKE_CAP = 2000;

export type ScatterArea = { cx: number; cy: number; radius: number } | { x: number; y: number; width: number; height: number };
export type ScatterPoint = { x: number; y: number; scale: number; rotation: number; /** Index into `options.sources`. */ source: number };

/** A small, fast, seedable generator in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ATTEMPTS_PER_POINT = 30;

/**
 * Poisson-disc points inside `area`: no two (nor one and an `existing` point) closer than `spacing`, at most
 * `density x area / 10,000` in all, minus the `existing` points already inside the area, so a second dab over the
 * same ground fills the gaps instead of stacking. Deterministic from `seed`. Points are dart-thrown against a
 * spacing grid rather than grown from one seed point (Bridson's active list), because a capped Bridson run
 * clusters around its start and a brush wants an even sprinkle.
 */
export function scatterPoints(area: ScatterArea, options: ScatterOptions, existing: readonly { x: number; y: number }[] = []): ScatterPoint[] {
  const opts = ScatterOptionsSchema.parse(options);
  const rng = mulberry32(opts.seed);
  const circle = 'radius' in area;
  const box = circle ? { x: area.cx - area.radius, y: area.cy - area.radius, width: area.radius * 2, height: area.radius * 2 } : area;
  const areaSize = circle ? Math.PI * area.radius * area.radius : area.width * area.height;
  const inside = (x: number, y: number) => (circle ? (x - area.cx) ** 2 + (y - area.cy) ** 2 <= area.radius ** 2 : x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height);
  const already = existing.filter((p) => inside(p.x, p.y)).length;
  const target = Math.min(SCATTER_STROKE_CAP, Math.floor((opts.density * areaSize) / 10_000) - already);
  if (target <= 0 || box.width <= 0 || box.height <= 0) return [];

  const spacing = opts.spacing;
  const cell = spacing > 0 ? spacing / Math.SQRT2 : 0;
  const grid = new Map<string, { x: number; y: number }[]>();
  const put = (p: { x: number; y: number }) => {
    if (cell === 0) return;
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    const bucket = grid.get(k);
    if (bucket) bucket.push(p);
    else grid.set(k, [p]);
  };
  const clear = (x: number, y: number) => {
    if (cell === 0) return true;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (let i = gx - 2; i <= gx + 2; i++) {
      for (let j = gy - 2; j <= gy + 2; j++) {
        for (const p of grid.get(`${i},${j}`) ?? []) if ((p.x - x) ** 2 + (p.y - y) ** 2 < spacing * spacing) return false;
      }
    }
    return true;
  };
  for (const p of existing) put(p);

  const total = opts.sources.reduce((sum, s) => sum + s.weight, 0);
  const pick = () => {
    let r = rng() * total;
    for (let i = 0; i < opts.sources.length; i++) {
      r -= opts.sources[i]!.weight;
      if (r < 0) return i;
    }
    return opts.sources.length - 1;
  };
  const [sMin, sMax] = opts.scale[0] <= opts.scale[1] ? opts.scale : ([opts.scale[1], opts.scale[0]] as const);
  const [rMin, rMax] = opts.rotation[0] <= opts.rotation[1] ? opts.rotation : ([opts.rotation[1], opts.rotation[0]] as const);

  const out: ScatterPoint[] = [];
  let attempts = 0;
  const budget = target * MAX_ATTEMPTS_PER_POINT;
  while (out.length < target && attempts < budget) {
    attempts += 1;
    const x = box.x + rng() * box.width;
    const y = box.y + rng() * box.height;
    if (!inside(x, y) || !clear(x, y)) continue;
    const p = { x, y };
    put(p);
    out.push({ x, y, scale: sMin + rng() * (sMax - sMin), rotation: rMin + rng() * (rMax - rMin), source: pick() });
  }
  return out;
}
