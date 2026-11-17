/**
 * Align and distribute (Phase 137 Theme E): pure, no React. Alignment is against the selection's bounds (Figma's and
 * Unreal's default; no key-object mode). Extents are footprint extents, so a rotated box aligns by its rotated
 * outline. `y` is the plan's second axis (world Z in a 3D level). Each op is one undo step.
 */
import { translateObjects, findObject, type EditState, type ObjectRef } from './level-edit-model';
import { objectExtentPoints, selectionBounds } from './level-selection';

export type AlignAxis = 'x' | 'y';
export type AlignEdge = 'min' | 'centre' | 'max';

type Span = { ref: ObjectRef; min: number; max: number };

function spans(state: EditState, refs: readonly ObjectRef[], axis: AlignAxis): Span[] {
  const out: Span[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.layerId}:${ref.objectId}`;
    const object = findObject(state.level, ref);
    if (!object || seen.has(key)) continue;
    seen.add(key);
    const values = objectExtentPoints(object).map((p) => p[axis]);
    out.push({ ref, min: Math.min(...values), max: Math.max(...values) });
  }
  return out;
}

const centreOf = (s: Span): number => (s.min + s.max) / 2;
/** A move along `axis`; float noise below a billionth of a pixel is no move, so an already-aligned set records nothing. */
const delta = (axis: AlignAxis, by: number) => {
  const v = Math.abs(by) < 1e-9 ? 0 : by;
  return axis === 'x' ? { dx: v, dy: 0 } : { dx: 0, dy: v };
};

/** Align `refs` on `axis` to the selection bounds' `edge` (min = left / top, max = right / bottom). A single object stays put. */
export function alignObjects(state: EditState, refs: readonly ObjectRef[], axis: AlignAxis, edge: AlignEdge): EditState {
  const list = spans(state, refs, axis);
  const bounds = selectionBounds(state.level, list.map((s) => s.ref));
  if (list.length < 2 || !bounds) return state;
  const lo = axis === 'x' ? bounds.x : bounds.y;
  const hi = lo + (axis === 'x' ? bounds.width : bounds.height);
  const target = edge === 'min' ? lo : edge === 'max' ? hi : (lo + hi) / 2;
  return translateObjects(
    state,
    list.map((s) => ({ ref: s.ref, ...delta(axis, target - (edge === 'min' ? s.min : edge === 'max' ? s.max : centreOf(s))) })),
  );
}

/** Space three or more objects' centres evenly on `axis`, keeping the two outermost where they are. */
export function distributeObjects(state: EditState, refs: readonly ObjectRef[], axis: AlignAxis): EditState {
  const list = spans(state, refs, axis).sort((a, b) => centreOf(a) - centreOf(b));
  if (list.length < 3) return state;
  const first = centreOf(list[0]!), last = centreOf(list[list.length - 1]!);
  const step = (last - first) / (list.length - 1);
  return translateObjects(
    state,
    list.map((s, i) => ({ ref: s.ref, ...delta(axis, first + step * i - centreOf(s)) })),
  );
}
