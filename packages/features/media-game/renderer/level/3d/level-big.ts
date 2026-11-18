/**
 * What a kilometre-scale level on a much larger terrain needs from the 3D view: where to look, how far to draw, and
 * how coarse the ground and grid may be. Pure, no three.
 */
import { levelOrigin, metresPerTile, type GameLevelTerrainDetail } from '@midnite/studio-shared';

import type { EditLevel } from '../level-edit-model';
import type { GroundTile } from './level-cull';

/** A ground more than this many times the area of the work is not what the view opens on. */
export const FOCUS_GROUND_RATIO = 10;
/** The ground is cut into at most this many tiles a side, however large it is. */
export const MAX_TILES_PER_SIDE = 32;

/** A further terrain pack's ground is cut into at most this many tiles a side. */
export const MAX_PACK_TILES_PER_SIDE = 16;

/**
 * The ground tiles of a further pack over `rect`: `MAX_PACK_TILES_PER_SIDE` a side at most (never finer than
 * `presetTile`), leaving out any tile that lies wholly inside one of `above` (the terrain and the packs over it).
 */
export function packTiles(rect: GroundTile, presetTile: number, above: readonly GroundTile[]): GroundTile[] {
  const side = Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  const size = Math.max(presetTile, Math.ceil(side / MAX_PACK_TILES_PER_SIDE));
  const out: GroundTile[] = [];
  for (let z = rect.minZ; z < rect.maxZ - 1e-6; z += size) {
    for (let x = rect.minX; x < rect.maxX - 1e-6; x += size) {
      const t = { minX: x, minZ: z, maxX: Math.min(rect.maxX, x + size), maxZ: Math.min(rect.maxZ, z + size) };
      if (!above.some((a) => t.minX >= a.minX && t.maxX <= a.maxX && t.minZ >= a.minZ && t.maxZ <= a.maxZ)) out.push(t);
    }
  }
  return out;
}

/** Where the level's work is, in metres: its map rectangle and every item. */
export function workBounds(level: Pick<EditLevel, 'width' | 'height' | 'properties'>, items: ReadonlyArray<{ position: readonly [number, number, number] }>): GroundTile {
  const mpt = metresPerTile(level), o = levelOrigin(level);
  const out = { minX: o.x, minZ: o.z, maxX: o.x + level.width * mpt, maxZ: o.z + level.height * mpt };
  for (const item of items) {
    out.minX = Math.min(out.minX, item.position[0]); out.maxX = Math.max(out.maxX, item.position[0]);
    out.minZ = Math.min(out.minZ, item.position[2]); out.maxZ = Math.max(out.maxZ, item.position[2]);
  }
  return out;
}

/** What the view opens on and lays its grid over: the ground, or the work when the ground dwarfs it (an 1.6 km level on a 10 km terrain). */
export function focusBounds(ground: GroundTile, work: GroundTile): GroundTile {
  const area = (b: GroundTile) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxZ - b.minZ);
  return area(ground) > FOCUS_GROUND_RATIO * area(work) ? work : ground;
}

/**
 * How far from the focus things are drawn: the preset's draw distance close in, growing with the camera's distance
 * once it backs off, so an overview of a big level shows the level and not a disc in the fog.
 */
export const reachFor = (drawDistance: number, cameraDistance: number): number => Math.max(drawDistance, cameraDistance * 1.25);

/** The ground tile edge: the preset's, or larger so the ground never exceeds {@link MAX_TILES_PER_SIDE} tiles a side. */
export function tileSizeFor(bounds: GroundTile, presetTile: number): number {
  const side = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return Math.max(presetTile, Math.ceil(side / MAX_TILES_PER_SIDE));
}

/** The grid's fine line spacing for an area `side` metres across: 1 m, 10 m or 100 m (bold lines are ten times it). */
export const gridUnit = (side: number): 1 | 10 | 100 => (side <= 400 ? 1 : side <= 4000 ? 10 : 100);

/** A terrain detail's roads and building outlines as line-segment vertices (`x, y, z` triples, two per segment) at height `y`. */
export function detailSegments(detail: Pick<GameLevelTerrainDetail, 'roads' | 'buildings'>, y: number): { roads: Float32Array; buildings: Float32Array } {
  const run = (lines: ReadonlyArray<readonly number[]>, close: boolean): Float32Array => {
    const out: number[] = [];
    for (const p of lines) {
      const n = Math.floor(p.length / 2);
      for (let i = 0; i + 1 < n; i += 1) out.push(p[i * 2]!, y, p[i * 2 + 1]!, p[i * 2 + 2]!, y, p[i * 2 + 3]!);
      if (close && n > 2) out.push(p[(n - 1) * 2]!, y, p[(n - 1) * 2 + 1]!, p[0]!, y, p[1]!);
    }
    return new Float32Array(out);
  };
  return { roads: run(detail.roads.map((r) => r.points), false), buildings: run(detail.buildings, true) };
}
