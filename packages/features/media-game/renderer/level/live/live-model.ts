import type { GameEntitySnapshot } from '@midnite/studio-shared';

import { findObject, objectCentre, setObjectPlacement, type EditLevel, type EditState, type LevelObject, type ObjectRef, type PlanPoint } from '../level-edit-model';
import { groundY, worldToObjectPoint } from '../3d/level-world';

/**
 * Live ghosts (Phase 140 Theme E): where a running game's entities are, in the editor's own coordinates. Pure.
 *
 * The kit reports 2D entities at their object `x`/`y` (pixels) and 3D ones in world metres, `y` up, at the footprint
 * centre; {@link ghostPoint} brings both into the object space the editor draws in (the caller maps it to the canvas).
 */

/** A ghost's position in object coordinates (pixels). */
export function ghostPoint(level: EditLevel, ghost: Pick<GameEntitySnapshot, 'x' | 'y' | 'z'>, is3d: boolean): PlanPoint {
  return is3d ? worldToObjectPoint(level, ghost.x, ghost.z ?? 0) : { x: ghost.x, y: ghost.y };
}

/** Where the authored object sits on the same basis the kit reports: the footprint centre in 3D, `x`/`y` in 2D. */
export function authoredPoint(object: LevelObject, is3d: boolean): PlanPoint {
  return is3d ? objectCentre(object) : { x: object.x, y: object.y };
}

export type GhostLink = { id: number; ref: ObjectRef; from: PlanPoint; to: PlanPoint };

function* objectsOf(level: EditLevel): Generator<{ ref: ObjectRef; object: LevelObject }> {
  for (const layer of level.layers) {
    if (layer.type !== 'objectgroup' || typeof layer.id !== 'number') continue;
    for (const object of layer.objects ?? []) yield { ref: { layerId: layer.id, objectId: object.id }, object };
  }
}

/** A dashed line per ghost whose `id` is a level object: authored position to live position. A ghost on its spot gets none. */
export function ghostLinks(level: EditLevel, ghosts: readonly GameEntitySnapshot[], is3d: boolean): GhostLink[] {
  const byId = new Map<number, { ref: ObjectRef; object: LevelObject }>();
  for (const o of objectsOf(level)) byId.set(o.object.id, o);
  const out: GhostLink[] = [];
  for (const g of ghosts) {
    if (g.id === null) continue;
    const hit = byId.get(g.id);
    if (!hit) continue;
    const from = authoredPoint(hit.object, is3d), to = ghostPoint(level, g, is3d);
    if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5) continue;
    out.push({ id: g.id, ref: hit.ref, from, to });
  }
  return out;
}

/** The live entity that is `ref`'s object, if the game reports one. */
export function liveTwin(ghosts: readonly GameEntitySnapshot[], ref: ObjectRef): GameEntitySnapshot | null {
  return ghosts.find((g) => g.id === ref.objectId) ?? null;
}

/**
 * "Copy live position": the object takes its live twin's position, as one undo step. A 3D object keeps its footprint
 * (the origin moves by the same offset as the centre) and takes the live height as `elevation` only when the live
 * height is not simply the ground. Only position changes.
 */
export function copyLivePosition(state: EditState, ref: ObjectRef, ghost: GameEntitySnapshot, is3d: boolean): EditState {
  const object = findObject(state.level, ref);
  if (!object) return state;
  const live = ghostPoint(state.level, ghost, is3d);
  if (!is3d) return setObjectPlacement(state, ref, live);
  const centre = objectCentre(object);
  const at = { x: object.x + (live.x - centre.x), y: object.y + (live.y - centre.y) };
  const ground = groundY(state.level);
  const hasElevation = object.properties?.some((p) => p.name === 'elevation') ?? false;
  const elevation = ghost.y;
  return setObjectPlacement(state, ref, Number.isFinite(elevation) && (hasElevation || Math.abs(elevation - ground) > 0.01) ? { ...at, elevation: Math.round(elevation * 1000) / 1000 } : at);
}
