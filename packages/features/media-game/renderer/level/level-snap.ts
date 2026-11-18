/**
 * Snap settings for the level editor (Phase 137 Theme F): pure, no React, no three. One {@link LevelSnap} drives the
 * Floorplan's drag step, the 3D gizmo's translate / rotate steps and the optional drop onto the surface below.
 */
import { ANGLE_STEPS, GRID_STEPS } from '@midnite/studio-frame/viewport3d';

import type { EditLevel } from './level-edit-model';
import type { WorldItem } from './3d/level-world';

export type LevelSnap = {
  /** The master switch (the popover's "Snap" switch). */
  enabled: boolean;
  /** A fraction of a tile the Floorplan snaps to; 0 = off. */
  planStep: 1 | 0.5 | 0.25 | 0;
  /** Metres, one of the frame's `GRID_STEPS`. */
  grid: number;
  /** Degrees, one of the frame's `ANGLE_STEPS`. */
  angle: number;
  /** Drop onto the top face under the object when a move ends. */
  surface: boolean;
};

export const DEFAULT_LEVEL_SNAP: LevelSnap = { enabled: true, planStep: 1, grid: 0.5, angle: 15, surface: false };

export const PLAN_STEPS: readonly LevelSnap['planStep'][] = [1, 0.5, 0.25, 0];

/** Any stored value as a valid {@link LevelSnap}; each field falls back to its default on its own. */
export function sanitiseSnap(raw: unknown): LevelSnap {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LEVEL_SNAP;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    planStep: PLAN_STEPS.includes(r.planStep as LevelSnap['planStep']) ? (r.planStep as LevelSnap['planStep']) : d.planStep,
    grid: (GRID_STEPS as readonly number[]).includes(r.grid as number) ? (r.grid as number) : d.grid,
    angle: (ANGLE_STEPS as readonly number[]).includes(r.angle as number) ? (r.angle as number) : d.angle,
    surface: typeof r.surface === 'boolean' ? r.surface : d.surface,
  };
}

/** The Floorplan's snap step in map pixels, or `null` when snapping is off. */
export function planSnapStep(level: Pick<EditLevel, 'tilewidth' | 'tileheight'>, snap: LevelSnap): { x: number; y: number } | null {
  if (!snap.enabled || snap.planStep === 0) return null;
  return { x: level.tilewidth * snap.planStep, y: level.tileheight * snap.planStep };
}

/** The grid / angle steps the 3D gizmo takes: 0 (off) while the master switch is off. */
export const gizmoSteps = (snap: LevelSnap): { grid: number; angle: number } => ({ grid: snap.enabled ? snap.grid : 0, angle: snap.enabled ? snap.angle : 0 });

/**
 * The base height an object lands on when it drops onto the surface below: the highest top (`position.y + size.y`,
 * a box item's base is its `position.y`) among box items overlapping `footprint` on X/Z, else `groundY`. World
 * metres, the same space as the `elevation` property.
 */
export function surfaceElevation(
  items: readonly Pick<WorldItem, 'index' | 'kind' | 'position' | 'size' | 'bounds' | 'sel'>[],
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number },
  excludeIds: ReadonlySet<number>,
  groundY: number,
): number {
  let top = groundY;
  for (const it of items) {
    if (it.kind !== 'box' || excludeIds.has(it.sel.objectId)) continue;
    const b = it.bounds;
    if (b.maxX <= footprint.minX || b.minX >= footprint.maxX || b.maxZ <= footprint.minZ || b.minZ >= footprint.maxZ) continue;
    top = Math.max(top, it.position[1] + it.size[1]);
  }
  return top;
}

/** The XZ box a footprint of `size` (metres, x by z) covers at `yaw` radians about `centre`. */
export function footprintBox(centre: readonly [number, number], size: readonly [number, number], yaw: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hx = (c * size[0] + s * size[1]) / 2, hz = (s * size[0] + c * size[1]) / 2;
  return { minX: centre[0] - hx, maxX: centre[0] + hx, minZ: centre[1] - hz, maxZ: centre[1] + hz };
}
