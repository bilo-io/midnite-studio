import type { WorldItem } from './level-world';

/**
 * What the 3D view draws over the level besides its objects (Phase 140 Themes E to G), in world metres with `y` up.
 * Pure data; `level-extras-view.tsx` turns it into three meshes.
 */
export type SceneGhost = { key: number; id: number | null; type: string; alive: boolean; x: number; y: number; z: number };
export type SceneExtras = {
  /** Ids of level objects whose footprint is a collider / a trigger zone. */
  colliderIds: readonly number[];
  triggerIds: readonly number[];
  /** Nav-mesh polygons as `[x, z]` metres, at ground height. */
  nav: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  ghosts: readonly SceneGhost[];
};

export const NO_SCENE_EXTRAS: SceneExtras = { colliderIds: [], triggerIds: [], nav: [], ghosts: [] };

export type ExtraBox = { key: number; position: [number, number, number]; size: [number, number, number]; yaw: number };

/** The boxes for the level objects `ids` names: each item's drawn footprint, centred on its box. */
export function extraBoxes(items: readonly WorldItem[], ids: readonly number[]): ExtraBox[] {
  if (ids.length === 0) return [];
  const want = new Set(ids);
  const out: ExtraBox[] = [];
  for (const it of items) {
    if (!want.has(it.sel.objectId) || it.kind === 'path') continue;
    out.push({ key: it.sel.objectId, position: [it.position[0], it.position[1] + it.size[1] / 2, it.position[2]], size: [Math.max(it.size[0], 0.05), Math.max(it.size[1], 0.05), Math.max(it.size[2], 0.05)], yaw: it.yaw });
  }
  return out;
}

/** A segment from each ghost's authored object to its live position (3D, metres), for ghosts whose `id` is a level object. */
export function ghostSegments(items: readonly WorldItem[], ghosts: readonly SceneGhost[]): number[] {
  const byId = new Map<number, WorldItem>();
  for (const it of items) byId.set(it.sel.objectId, it);
  const pts: number[] = [];
  for (const g of ghosts) {
    const it = g.id === null ? undefined : byId.get(g.id);
    if (!it) continue;
    const from: [number, number, number] = [it.position[0], it.position[1], it.position[2]];
    if (Math.hypot(from[0] - g.x, from[1] - g.y, from[2] - g.z) < 0.02) continue;
    pts.push(...from, g.x, g.y, g.z);
  }
  return pts;
}

/** Nav polygons as line segments (a closed loop each) at `y`. */
export function navSegments(nav: SceneExtras['nav'], y: number): number[] {
  const pts: number[] = [];
  for (const poly of nav) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      pts.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return pts;
}
