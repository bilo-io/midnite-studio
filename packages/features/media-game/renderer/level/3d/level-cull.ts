/**
 * One cull pass for the 3D view (Phase 136 Themes B and C): grid candidates near the focus, the exact frustum test,
 * then LOD, then the model and light budgets nearest first. Pure — the frustum test arrives as a callback — so the
 * whole pipeline is unit-tested without WebGL.
 */
import { lodFor } from './level-lod';
import type { WorldItem } from './level-world';
import type { OptimisationPreset } from './optimisation';
import type { SpatialGrid } from './spatial-grid';

export type CullInput = {
  items: readonly WorldItem[];
  grid: SpatialGrid;
  camera: readonly [number, number, number];
  focus: readonly [number, number, number];
  /** {@link dollyOffset}: how much farther the camera is than an orbit lens would be. */
  offset: number;
  fovDeg: number;
  viewportHeight: number;
  preset: OptimisationPreset;
  inFrustum: (item: WorldItem) => boolean;
  /** Which model names are failed (their objects stay boxes). */
  modelFailed?: (name: string) => boolean;
  /** An item drawn on its own (the selection under the gizmo), left out of every list. */
  exclude?: number | null;
};

export type CullResult = {
  /** Item indices drawn as instanced boxes. */
  boxes: number[];
  /** Item indices drawn as their model, nearest first, at most `preset.maxModels`. */
  models: number[];
  /** `light` entities lit, nearest first, at most `preset.maxLights`. */
  lights: number[];
  /** Candidates the grid returned (what the pass cost). */
  candidates: number;
};

const scratch: number[] = [];

export const itemRadius = (item: WorldItem): number => Math.hypot(item.size[0], item.size[1], item.size[2]) / 2;

export function cull(input: CullInput): CullResult {
  const { items, preset, focus, camera } = input;
  const reach = preset.drawDistance;
  const found = input.grid.query({ minX: focus[0] - reach, minZ: focus[2] - reach, maxX: focus[0] + reach, maxZ: focus[2] + reach }, scratch);
  const boxes: number[] = [];
  const full: Array<{ index: number; d: number }> = [];
  const lights: Array<{ index: number; d: number }> = [];
  for (const index of found) {
    if (index === input.exclude) continue;
    const item = items[index]!;
    if (item.kind === 'path') continue;
    const cx = item.position[0], cy = item.position[1] + item.size[1] / 2, cz = item.position[2];
    const distance = Math.hypot(cx - camera[0], cy - camera[1], cz - camera[2]);
    const radius = itemRadius(item);
    const lod = lodFor({ radius, distance, focusDistance: Math.max(0, distance - input.offset), fovDeg: input.fovDeg, viewportHeight: input.viewportHeight }, preset);
    if (lod === 'hidden') continue;
    if (!input.inFrustum(item)) continue;
    if (item.type === 'light') lights.push({ index, d: distance });
    if (lod === 'full' && item.model && !input.modelFailed?.(item.model)) full.push({ index, d: distance });
    else boxes.push(index);
  }
  full.sort((a, b) => a.d - b.d);
  const models: number[] = [];
  for (const [i, entry] of full.entries()) {
    if (i < preset.maxModels) models.push(entry.index);
    else boxes.push(entry.index);
  }
  lights.sort((a, b) => a.d - b.d);
  return { boxes, models, lights: lights.slice(0, preset.maxLights).map((l) => l.index), candidates: found.length };
}

/** Ground tiles over `bounds` (metres), `tile` metres a side: what the draw distance culls and the preset resolves. */
export type GroundTile = { minX: number; minZ: number; maxX: number; maxZ: number };

export function groundTiles(bounds: GroundTile, tile: number): GroundTile[] {
  const out: GroundTile[] = [];
  const step = Math.max(1, tile);
  for (let z = bounds.minZ; z < bounds.maxZ - 1e-6; z += step) {
    for (let x = bounds.minX; x < bounds.maxX - 1e-6; x += step) {
      out.push({ minX: x, minZ: z, maxX: Math.min(bounds.maxX, x + step), maxZ: Math.min(bounds.maxZ, z + step) });
    }
  }
  return out;
}

/** Whether a tile is within `reach` of the focus on the ground (nearest point of the tile). */
export function tileInReach(tile: GroundTile, focus: readonly [number, number, number], reach: number): boolean {
  const dx = Math.max(tile.minX - focus[0], 0, focus[0] - tile.maxX);
  const dz = Math.max(tile.minZ - focus[2], 0, focus[2] - tile.maxZ);
  return Math.hypot(dx, dz) <= reach;
}

export type ViewStats = { fps: number; calls: number; triangles: number; visible: number; total: number; models: number };

/** The readout line: `60 fps · 12 draw calls · 340 / 3,000 objects · 8 models`. */
export function formatStats(s: ViewStats): string {
  const n = (v: number) => Math.round(v).toLocaleString('en-US');
  return `${n(s.fps)} fps · ${n(s.calls)} draw calls · ${n(s.visible)} / ${n(s.total)} objects · ${n(s.models)} models`;
}
