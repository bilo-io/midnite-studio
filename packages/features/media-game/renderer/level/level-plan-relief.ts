/**
 * The Floorplan reads the land (Phase 141 Theme E): a hillshade under the grid for each height grid a terrain sends,
 * and the elevation readout under the pointer. Pure, no DOM.
 */
import { hillshade, levelPixelsToWorld, type GameLevelTerrain } from '@midnite/studio-shared';

import type { EditLevel } from './level-edit-model';
import { decodeHeights, type HeightField, type Relief } from './3d/level-relief';

/** The largest side a hillshade is drawn at; a terrain's grids are at most 257 a side, so this only caps the detail. */
export const HILLSHADE_MAX_SIDE = 1024;

export type PlanHillshade = { minX: number; minZ: number; maxX: number; maxZ: number; width: number; height: number; pixels: Uint8ClampedArray };

/** One hillshade per height grid, drawn in this order: the packs last-first, then the terrain, then its detail on top. */
export function planHillshades(terrain: Pick<GameLevelTerrain, 'heights' | 'detail' | 'packs'> | null): PlanHillshade[] {
  if (!terrain) return [];
  const fields: HeightField[] = [];
  for (const p of [...(terrain.packs ?? [])].reverse()) {
    const f = p.heights ? decodeHeights(p.heights) : null;
    if (f) fields.push(f);
  }
  for (const h of [terrain.heights, terrain.detail?.heights]) {
    const f = h ? decodeHeights(h) : null;
    if (f) fields.push(f);
  }
  return fields.map((f) => {
    const width = Math.min(HILLSHADE_MAX_SIDE, f.cols), height = Math.min(HILLSHADE_MAX_SIDE, f.rows);
    return { minX: f.minX, minZ: f.minZ, maxX: f.maxX, maxZ: f.maxZ, width, height, pixels: hillshade(f, width, height) };
  });
}

const metres = (v: number): string => `${v.toFixed(1).replace('-', '−')} m`;

/** "x 12.4 m · z −3.0 m · elevation 41.2 m" at a map-pixel point, the ground's height from the sampler; `null` without a relief. */
export function elevationReadout(level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, relief: Pick<Relief, 'heightAt'> | null, at: { x: number; y: number } | null): string | null {
  if (!relief || !at) return null;
  const [x, z] = levelPixelsToWorld(level, at.x, at.y);
  return `x ${metres(x)} · z ${metres(z)} · elevation ${metres(relief.heightAt(x, z))}`;
}
