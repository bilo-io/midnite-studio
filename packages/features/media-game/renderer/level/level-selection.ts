/**
 * Selection-only helpers for the level editor (Phase 137 Theme A): pure, no React. Refs, their keys and the
 * map-pixel extent of the selected objects. The state transitions live in `level-edit-model.ts`.
 */
import { footprintCorners, pathPoints } from './level-plan';
import type { EditLevel, LevelObject, ObjectRef, PlanPoint, PlanRect } from './level-edit-model';

/** A stable string for a ref: Set and Map keys, React keys. */
export const refKey = (ref: ObjectRef): string => `${ref.layerId}:${ref.objectId}`;

/** Whether two refs name the same object (`null` equals only `null`). */
export const sameRef = (a: ObjectRef | null, b: ObjectRef | null): boolean =>
  a === b || (a !== null && b !== null && a.layerId === b.layerId && a.objectId === b.objectId);

/** Every map-pixel point that makes up an object: footprint corners, path vertices, or its lone point. */
export function objectExtentPoints(o: Pick<LevelObject, 'x' | 'y' | 'width' | 'height' | 'rotation'> & { polyline?: unknown }): PlanPoint[] {
  const corners = footprintCorners(o);
  const path = pathPoints(o);
  const points = [...(corners ?? []), ...path];
  return points.length > 0 ? points : [{ x: o.x, y: o.y }];
}

/** The union rectangle of `refs` (stale refs skipped), or `null` when none resolves. */
export function selectionBounds(level: EditLevel, refs: readonly ObjectRef[]): PlanRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ref of refs) {
    const o = level.layers.find((l) => l.id === ref.layerId)?.objects?.find((x) => x.id === ref.objectId);
    if (!o) continue;
    for (const p of objectExtentPoints(o)) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
