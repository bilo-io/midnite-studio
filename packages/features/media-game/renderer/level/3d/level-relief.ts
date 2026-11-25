/**
 * The ground's real shape in the 3D view: a terrain pack's heights decoded into fields, one height sampler over
 * both (fine over the part the level works in, coarse over the rest), and what the view needs to sit things on it.
 * Pure, no three.
 */
import type { GameLevelHeights, GameLevelTerrain } from '@midnite/studio-shared';

import type { GroundTile } from './level-cull';
import type { WorldItem } from './level-world';

type V3 = [number, number, number];

export type HeightField = GroundTile & { cols: number; rows: number; values: Float32Array };

/** A wire height grid as metres; `null` when its data does not hold `cols × rows` samples. */
export function decodeHeights(h: GameLevelHeights): HeightField | null {
  let raw: string;
  try {
    raw = atob(h.data);
  } catch {
    return null;
  }
  const n = h.cols * h.rows;
  if (raw.length !== n * 2 || !(h.maxX > h.minX) || !(h.maxZ > h.minZ)) return null;
  const values = new Float32Array(n), span = h.max - h.min;
  for (let i = 0; i < n; i += 1) values[i] = h.min + ((raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)) / 65535) * span;
  return { minX: h.minX, minZ: h.minZ, maxX: h.maxX, maxZ: h.maxZ, cols: h.cols, rows: h.rows, values };
}

export const inField = (f: GroundTile, x: number, z: number): boolean => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ;

/** The field's height at a point, bilinear between its vertices; a point outside reads the nearest edge. */
export function sampleField(f: HeightField, x: number, z: number): number {
  const fx = Math.min(f.cols - 1, Math.max(0, ((x - f.minX) / (f.maxX - f.minX)) * (f.cols - 1)));
  const fz = Math.min(f.rows - 1, Math.max(0, ((z - f.minZ) / (f.maxZ - f.minZ)) * (f.rows - 1)));
  const x0 = Math.min(f.cols - 2, Math.floor(fx)), z0 = Math.min(f.rows - 2, Math.floor(fz)), tx = fx - x0, tz = fz - z0;
  const at = (i: number, j: number): number => f.values[j * f.cols + i]!;
  return (at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx) * (1 - tz) + (at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx) * tz;
}

export type Relief = {
  /** The ground's height at a world point, metres: the fine field where it reaches, else the terrain's coarse one, else the first further pack that covers the point, else `outside`. */
  heightAt: (x: number, z: number) => number;
  /** The lowest and highest ground anywhere on the terrain and its packs. */
  min: number;
  max: number;
  fine: HeightField | null;
  coarse: HeightField | null;
  /** The further packs' fields, in the level's order (an earlier one lies over a later one). */
  packs: HeightField[];
};

/** A level terrain's relief, or `null` when no pack sent heights (the view then stays flat). `outside` is the height past every field. */
export function reliefOf(terrain: Pick<GameLevelTerrain, 'heights' | 'detail' | 'packs'> | null, outside = 0): Relief | null {
  const coarse = terrain?.heights ? decodeHeights(terrain.heights) : null;
  const fine = terrain?.detail?.heights ? decodeHeights(terrain.detail.heights) : null;
  const packs = (terrain?.packs ?? []).map((p) => (p.heights ? decodeHeights(p.heights) : null)).filter((f): f is HeightField => f !== null);
  if (!coarse && !fine && packs.length === 0) return null;
  let min = Infinity, max = -Infinity;
  for (const f of [coarse, fine, ...packs]) {
    if (!f) continue;
    for (let i = 0; i < f.values.length; i += 1) {
      const v = f.values[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const heightAt = (x: number, z: number): number => {
    if (fine && inField(fine, x, z)) return sampleField(fine, x, z);
    if (coarse && inField(coarse, x, z)) return sampleField(coarse, x, z);
    for (const f of packs) if (inField(f, x, z)) return sampleField(f, x, z);
    // Past every field: the fine field's nearest edge when the terrain stands alone, the stated height once packs surround it.
    return packs.length === 0 && fine ? sampleField(fine, x, z) : outside;
  };
  return { heightAt, min, max, fine, coarse, packs };
}

/** Items as drawn on a relief: one with no `elevation` of its own sits on the ground under its centre. */
export function liftItems<T extends Pick<WorldItem, 'position' | 'grounded'>>(items: readonly T[], relief: Relief | null): T[] {
  if (!relief) return items as T[];
  return items.map((it) => (it.grounded ? { ...it, position: [it.position[0], relief.heightAt(it.position[0], it.position[2]), it.position[2]] as V3 } : it));
}

/** How far a pointer ray is marched for the ground, metres. */
export const RELIEF_RAY_FAR = 1_000_000;

/**
 * Where a ray first meets the relief: marched in steps that grow with distance, then narrowed by bisection.
 * `null` when it starts under the ground, or never comes down within `far` metres. The default reaches past a camera
 * that frames a whole region (GTACT's level is 64 km long); the growing step keeps that to about a thousand samples.
 */
export function reliefPoint(origin: V3, dir: V3, relief: Pick<Relief, 'heightAt'>, far = RELIEF_RAY_FAR): V3 | null {
  const above = (t: number): number => origin[1] + dir[1] * t - relief.heightAt(origin[0] + dir[0] * t, origin[2] + dir[2] * t);
  if (above(0) < 0) return null;
  let prev = 0, t = 0;
  while (t < far) {
    t = prev + Math.max(0.5, prev * 0.01);
    if (above(t) <= 0) {
      let lo = prev, hi = t;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      const x = origin[0] + dir[0] * hi, z = origin[2] + dir[2] * hi;
      return [x, relief.heightAt(x, z), z];
    }
    prev = t;
  }
  return null;
}

/**
 * Line-segment vertices (`x, y, z` triples, two per segment) for flat `[x, z, …]` runs laid on the ground: each run
 * is cut into pieces of at most `maxStep` metres so it follows the slopes, `lift` metres above them.
 */
export function drapedRuns(runs: ReadonlyArray<readonly number[]>, heightAt: (x: number, z: number) => number, lift: number, maxStep: number, close = false): Float32Array {
  const out: number[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / maxStep));
    for (let k = 0; k < n; k += 1) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      out.push(x0, heightAt(x0, z0) + lift, z0, x1, heightAt(x1, z1) + lift, z1);
    }
  };
  for (const p of runs) {
    const n = Math.floor(p.length / 2);
    for (let i = 0; i + 1 < n; i += 1) seg(p[i * 2]!, p[i * 2 + 1]!, p[i * 2 + 2]!, p[i * 2 + 3]!);
    if (close && n > 2) seg(p[(n - 1) * 2]!, p[(n - 1) * 2 + 1]!, p[0]!, p[1]!);
  }
  return new Float32Array(out);
}

/** A grid of `cellsX × cellsZ` cells of `unit` metres from (`x0`, `z0`), laid on the ground as line segments sampled every `step` metres. */
export function drapedGrid(x0: number, z0: number, cellsX: number, cellsZ: number, unit: number, step: number, heightAt: (x: number, z: number) => number, lift: number): Float32Array {
  const runs: number[][] = [];
  const x1 = x0 + cellsX * unit, z1 = z0 + cellsZ * unit;
  for (let i = 0; i <= cellsX; i += 1) runs.push([x0 + i * unit, z0, x0 + i * unit, z1]);
  for (let j = 0; j <= cellsZ; j += 1) runs.push([x0, z0 + j * unit, x1, z0 + j * unit]);
  return drapedRuns(runs, heightAt, lift, step);
}

/**
 * One ground tile's vertex lines along an axis: `segments` even steps from `min` to `max`, plus each of `cuts` that
 * falls strictly inside, so a hole's edge always lies on a line.
 */
export function tileLines(min: number, max: number, segments: number, cuts: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i <= segments; i += 1) out.push(min + ((max - min) * i) / segments);
  const eps = (max - min) * 1e-6;
  for (const c of cuts) if (c > min + eps && c < max - eps && !out.some((v) => Math.abs(v - c) <= eps)) out.push(c);
  return out.sort((a, b) => a - b);
}

/**
 * A building as triangle and edge vertices: walls from `base` to `top` round the footprint (flat `[x, z, …]`), with
 * the roof ring and the corner posts as edges. The roof itself is triangulated by the caller (it needs three).
 */
export function buildingWalls(footprint: readonly number[], base: number, top: number, triangles: number[], edges: number[]): void {
  let n = Math.floor(footprint.length / 2);
  // A ring that repeats its first point at the end is closed already.
  if (n > 3 && footprint[0] === footprint[(n - 1) * 2] && footprint[1] === footprint[(n - 1) * 2 + 1]) n -= 1;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const ax = footprint[i * 2]!, az = footprint[i * 2 + 1]!, bx = footprint[j * 2]!, bz = footprint[j * 2 + 1]!;
    triangles.push(ax, base, az, bx, base, bz, bx, top, bz, ax, base, az, bx, top, bz, ax, top, az);
    edges.push(ax, top, az, bx, top, bz, ax, base, az, ax, top, az);
  }
}
