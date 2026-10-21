/**
 * Terrain conform (Phase 105 Themes G + H): the field is reshaped under roads (level across their
 * width, smoothed along their length, bounded cut/fill) and then under buildings (flat at the
 * footprint's mean height). Buildings go second so a building never re-tilts a road.
 */
import type { TerrainBuilding } from '../media-terrain';
import { gridToWorld, sampleHeight } from './field-sample';
import type { Heightfield } from './heightfield';
import { sampleCatmullRom } from './road-graph';

/** Along-road smoothing window, metres. */
export const ROAD_PROFILE_WINDOW_M = 30;
/** Most cut/fill warnings listed by name. */
export const CONFORM_WARNING_LIMIT = 10;

export type ConformRoad = { id: number; path: [number, number][]; widthM: number };

/** Distance from `(px, pz)` to segment `a→b`, and the projection parameter clamped to `[0, 1]`. */
function toSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return { d: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t };
}

/** Grid index range covering world `[lo, hi]` on one axis. */
function gridRange(field: Heightfield, lo: number, hi: number): [number, number] {
  const n = field.resolution;
  const cell = field.worldSize / (n - 1);
  const half = field.worldSize / 2;
  return [Math.max(0, Math.floor((lo + half) / cell)), Math.min(n - 1, Math.ceil((hi + half) / cell))];
}

/**
 * Flattens the field along every road. The road's height is the terrain under its centreline,
 * smoothed by a 30 m moving average; inside the road's width the surface is set to it (level across),
 * and over `blendM` beyond the edge it blends linearly back to the original ground. A change larger
 * than `maxCutFillM` is clamped, so a road tilts with the ground rather than cutting a trench — and
 * that edge gets one warning. Where two roads' corridors overlap, the nearer centreline wins.
 */
export function conformRoads(
  field: Heightfield,
  roads: readonly ConformRoad[],
  opts: { blendM: number; maxCutFillM: number },
): { field: Heightfield; warnings: string[] } {
  const n = field.resolution;
  const cell = field.worldSize / (n - 1);
  const bestDist = new Float32Array(n * n).fill(Infinity);
  const bestTarget = new Float32Array(n * n);
  const bestHalf = new Float32Array(n * n);
  const bestRoad = new Int32Array(n * n).fill(-1);

  roads.forEach((road, roadIndex) => {
    const pts = sampleCatmullRom(road.path, Math.max(1, cell));
    if (pts.length < 2) return;
    const s = [0];
    for (let i = 1; i < pts.length; i += 1) s.push(s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    const ground = pts.map(([x, z]) => sampleHeight(field, x, z));
    // Moving average over the window: `s` rises monotonically, so two pointers over a prefix sum.
    const prefix = [0];
    for (const g of ground) prefix.push(prefix[prefix.length - 1]! + g);
    let lo = 0;
    let hi = 0;
    const target = pts.map((_, i) => {
      while (s[lo]! < s[i]! - ROAD_PROFILE_WINDOW_M / 2) lo += 1;
      while (hi + 1 < pts.length && s[hi + 1]! <= s[i]! + ROAD_PROFILE_WINDOW_M / 2) hi += 1;
      return (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
    });
    const half = road.widthM / 2;
    const reach = half + opts.blendM;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const [gx0, gx1] = gridRange(field, Math.min(ax, bx) - reach, Math.max(ax, bx) + reach);
      const [gz0, gz1] = gridRange(field, Math.min(az, bz) - reach, Math.max(az, bz) + reach);
      for (let gz = gz0; gz <= gz1; gz += 1) {
        for (let gx = gx0; gx <= gx1; gx += 1) {
          const [wx, wz] = gridToWorld(field, gx, gz);
          const { d, t } = toSegment(wx, wz, ax, az, bx, bz);
          const v = gz * n + gx;
          if (d >= reach || d >= bestDist[v]!) continue;
          bestDist[v] = d;
          bestTarget[v] = target[i]! + (target[i + 1]! - target[i]!) * t;
          bestHalf[v] = half;
          bestRoad[v] = roadIndex;
        }
      }
    }
  });

  const heights = new Float32Array(field.heights);
  const clamped = new Set<number>();
  for (let v = 0; v < n * n; v += 1) {
    const r = bestRoad[v]!;
    if (r < 0) continue;
    const orig = field.heights[v]!;
    const delta = bestTarget[v]! - orig;
    const limited = Math.max(-opts.maxCutFillM, Math.min(opts.maxCutFillM, delta));
    const d = bestDist[v]!;
    const half = bestHalf[v]!;
    if (d <= half) {
      if (limited !== delta) clamped.add(r);
      heights[v] = orig + limited;
    } else {
      const fade = opts.blendM > 0 ? 1 - (d - half) / opts.blendM : 0;
      heights[v] = orig + limited * Math.max(0, fade);
    }
  }

  const ids = [...clamped].sort((a, b) => a - b).map((r) => roads[r]!.id);
  const warnings = ids.slice(0, CONFORM_WARNING_LIMIT).map((id) => `Road ${id}: cut/fill clamped to ±${opts.maxCutFillM} m; the road follows the slope there.`);
  if (ids.length > CONFORM_WARNING_LIMIT) warnings.push(`…and ${ids.length - CONFORM_WARNING_LIMIT} more roads clamped.`);
  return { field: { ...field, heights }, warnings };
}

/** Even-odd point-in-polygon over `(x, z)`. */
export function pointInPolygon(x: number, z: number, polygon: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(x: number, z: number, polygon: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[(i + 1) % polygon.length]!;
    best = Math.min(best, toSegment(x, z, ax, az, bx, bz).d);
  }
  return best;
}

/**
 * Flattens the ground under each footprint to the mean of the field inside it, blending linearly back
 * to the original over `blendM` outside, and returns the buildings with `baseY` set to that level.
 */
export function flattenFootprints(
  field: Heightfield,
  buildings: readonly TerrainBuilding[],
  blendM: number,
): { field: Heightfield; buildings: TerrainBuilding[] } {
  const n = field.resolution;
  const heights = new Float32Array(field.heights);
  const out: TerrainBuilding[] = [];
  for (const building of buildings) {
    const { polygon } = building;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const [gx0, gx1] = gridRange(field, minX - blendM, maxX + blendM);
    const [gz0, gz1] = gridRange(field, minZ - blendM, maxZ + blendM);
    const inside: number[] = [];
    const ring: { v: number; d: number }[] = [];
    for (let gz = gz0; gz <= gz1; gz += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const [wx, wz] = gridToWorld(field, gx, gz);
        const v = gz * n + gx;
        if (pointInPolygon(wx, wz, polygon)) inside.push(v);
        else {
          const d = distanceToPolygon(wx, wz, polygon);
          if (d < blendM) ring.push({ v, d });
        }
      }
    }
    let level: number;
    if (inside.length > 0) {
      level = 0;
      for (const v of inside) level += heights[v]!;
      level /= inside.length;
    } else {
      // A footprint smaller than a grid cell: its height is the ground at its centre.
      level = sampleHeight({ ...field, heights }, (minX + maxX) / 2, (minZ + maxZ) / 2);
    }
    for (const v of inside) heights[v] = level;
    for (const { v, d } of ring) heights[v] = level + (heights[v]! - level) * (d / blendM);
    out.push({ ...building, baseY: Math.round(level * 100) / 100 });
  }
  return { field: { ...field, heights }, buildings: out };
}
