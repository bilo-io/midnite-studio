/**
 * Framing the open level for an agent (Phase 138 Theme G): pure maths over the edit model, no React. Ids resolve to
 * refs in any object layer; a rectangle in map pixels becomes a plan `View`; a set of refs becomes a world box for the
 * 3D camera.
 */

import type { EditLevel, ObjectRef, PlanRect } from './level-edit-model';
import { planBounds, type TerrainArea } from './level-plan';
import { selectionBounds } from './level-selection';
import { clampZoom, ZOOM_MIN, type View } from './level-view';

/** Breathing room round what is framed (a tenth of its size each side) and how close the plan may zoom. */
export const FRAME_MARGIN = 0.1;
export const FRAME_ZOOM_MAX = 4;
/** A point or a hair-thin object frames as at least this many map pixels, so the plan never zooms to nothing. */
const FRAME_MIN_PX = 32;

/** The plan `View` that fits `rect` (map pixels) in a `box`, centred, with {@link FRAME_MARGIN} and a zoom of at most {@link FRAME_ZOOM_MAX}. */
export function frameView(rect: PlanRect, box: { width: number; height: number }, margin = FRAME_MARGIN, maxZoom = FRAME_ZOOM_MAX): View {
  const w = Math.max(rect.width, FRAME_MIN_PX), h = Math.max(rect.height, FRAME_MIN_PX);
  const fit = Math.min(box.width / (w * (1 + 2 * margin)), box.height / (h * (1 + 2 * margin)));
  // A selection wider than the usual floor shows (objects a kilometre apart) still frames whole.
  const zoom = clampZoom(Math.min(maxZoom, fit), Math.min(ZOOM_MIN, fit));
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return { zoom, x: box.width / 2 - cx * zoom, y: box.height / 2 - cy * zoom };
}

/** Every object layer's object with one of `ids`, as refs (in `ids` order, duplicates once), and the ids nothing matched. */
export function resolveIds(level: EditLevel, ids: readonly number[]): { refs: ObjectRef[]; found: number[]; missing: number[] } {
  const owner = new Map<number, number>();
  for (const layer of level.layers) {
    if (layer.type !== 'objectgroup' || typeof layer.id !== 'number') continue;
    for (const o of layer.objects ?? []) if (!owner.has(o.id)) owner.set(o.id, layer.id);
  }
  const refs: ObjectRef[] = [], found: number[] = [], missing: number[] = [];
  for (const id of new Set(ids)) {
    const layerId = owner.get(id);
    if (layerId === undefined) missing.push(id);
    else {
      refs.push({ layerId, objectId: id });
      found.push(id);
    }
  }
  return { refs, found, missing };
}

/**
 * What a `frame` request points at, in map pixels: the objects' bounds, a region, or (neither given) the whole level.
 * `null` when ids were given but none of them exists.
 */
export function frameTarget(
  level: EditLevel,
  terrain: TerrainArea | null,
  ask: { ids?: readonly number[] | undefined; region?: PlanRect | undefined },
): PlanRect | null {
  if (ask.ids && ask.ids.length > 0) return selectionBounds(level, resolveIds(level, ask.ids).refs);
  if (ask.region) return ask.region;
  const b = planBounds(level, terrain);
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
}
