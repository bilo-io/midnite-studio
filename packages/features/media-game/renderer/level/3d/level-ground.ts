/**
 * Ground-plane geometry for the 3D tools (Phase 137 Theme G): pure, no three. The 3D view casts the pointer's ray
 * (the scene hands it over) and these turn it into the plan points the Floorplan's tools already take.
 */
import { drawSpawner, rotateObject, rotationToward, setVolume, beginStroke, endStroke, type EditLevel, type EditState, type ObjectRef, type PlanPoint } from '../level-edit-model';
import { levelPixelsToWorld } from '@midnite/studio-shared';
import { snapPlan } from '../level-plan';
import { planSnapStep, type LevelSnap } from '../level-snap';
import { worldToObjectPoint, type WorldItem } from './level-world';

type V3 = [number, number, number];

/** Where a ray meets the horizontal plane `y = groundY`; `null` when it runs parallel to it or the plane is behind it. */
export function groundPoint(origin: V3, dir: V3, groundY: number): V3 | null {
  if (Math.abs(dir[1]) < 1e-9) return null;
  const t = (groundY - origin[1]) / dir[1];
  if (!(t > 0)) return null;
  return [origin[0] + dir[0] * t, groundY, origin[2] + dir[2] * t];
}

/** A world X/Z point (metres) as a map-pixel plan point. */
export const planPointFromWorld = (level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, x: number, z: number): PlanPoint => worldToObjectPoint(level, x, z);

/** A plan point as world X/Z (metres). */
export function worldPointFromPlan(level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, p: PlanPoint): [number, number] {
  return levelPixelsToWorld(level, p.x, p.y);
}

/**
 * A ground point as the plan tools take it: through the plan's coordinates, then snapped by Theme F's step. `invert`
 * (Alt) flips snapping for the gesture, as in the Floorplan.
 */
export function snappedPlanPoint(level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, x: number, z: number, snap: LevelSnap, invert = false): PlanPoint {
  const step = planSnapStep(level, invert ? { ...snap, enabled: !snap.enabled } : snap);
  return snapPlan(level, planPointFromWorld(level, x, z), false, step);
}

/** The `setVolume` arguments of a drag between two ground points: the same the Floorplan builds for equal points. */
export function volumeFromDrag(level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, from: readonly [number, number], to: readonly [number, number], snap: LevelSnap, invert = false): { from: PlanPoint; to: PlanPoint } {
  return { from: snappedPlanPoint(level, from[0], from[1], snap, invert), to: snappedPlanPoint(level, to[0], to[1], snap, invert) };
}

/** Commit a volume drag as one undo step (nothing when it is smaller than a pixel). */
export function commitVolume(state: EditState, layerId: number, drag: { from: PlanPoint; to: PlanPoint }): EditState {
  return setVolume(state, layerId, drag.from, drag.to);
}

/** Commit a Spawn zone drag as one undo step: the same rectangle a volume drag gives, as a `spawner`. */
export function commitSpawner(state: EditState, layerId: number, drag: { from: PlanPoint; to: PlanPoint }, spawns?: string): EditState {
  return drawSpawner(state, layerId, drag.from, drag.to, spawns);
}

/** Turn every ref to face the ground point (x, z), snapped to `step` degrees (0 = free), as one undo step. */
export function rotateToward(state: EditState, refs: readonly ObjectRef[], level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, point: readonly [number, number], step: number): EditState {
  const target = planPointFromWorld(level, point[0], point[1]);
  let s = beginStroke(state);
  for (const ref of refs) {
    const o = s.level.layers.find((l) => l.id === ref.layerId)?.objects?.find((x) => x.id === ref.objectId);
    if (!o) continue;
    const w = o.width ?? 0, h = o.height ?? 0, t = ((o.rotation ?? 0) * Math.PI) / 180;
    const centre = { x: o.x + (w / 2) * Math.cos(t) - (h / 2) * Math.sin(t), y: o.y + (w / 2) * Math.sin(t) + (h / 2) * Math.cos(t) };
    s = rotateObject(s, ref, rotationToward(centre, target), step);
  }
  return endStroke(s);
}

/** Whether a ray passes through an item's box (its footprint turned by its yaw, base to top). */
export function rayHitsItem(origin: V3, dir: V3, item: Pick<WorldItem, 'position' | 'size' | 'yaw'>): boolean {
  // Into the item's frame: translate to its base centre, undo the yaw about +Y.
  const c = Math.cos(-item.yaw), s = Math.sin(-item.yaw);
  const turn = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
  const [ox, oz] = turn(origin[0] - item.position[0], origin[2] - item.position[2]);
  const [dx, dz] = turn(dir[0], dir[2]);
  const lo = [-item.size[0] / 2, 0, -item.size[2] / 2], hi = [item.size[0] / 2, item.size[1], item.size[2] / 2];
  const o = [ox, origin[1] - item.position[1], oz], d = [dx, dir[1], dz];
  let near = 0, far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-12) {
      if (o[i]! < lo[i]! || o[i]! > hi[i]!) return false;
      continue;
    }
    let a = (lo[i]! - o[i]!) / d[i]!, b = (hi[i]! - o[i]!) / d[i]!;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return false;
  }
  return true;
}
