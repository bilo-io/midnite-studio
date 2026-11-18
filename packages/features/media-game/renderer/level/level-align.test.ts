// vitest/node: Phase 137 Theme E — align and distribute against the selection bounds.
import { describe, expect, it } from 'vitest';

import { addLayer, addObject, createEditState, undo, type EditState, type ObjectRef } from './level-edit-model';
import { alignObjects, distributeObjects } from './level-align';
import { buildBlankLevel } from './new-scene-model';

const build = (boxes: Array<{ x: number; y: number; width: number; height: number; rotation?: number }>): { state: EditState; refs: ObjectRef[] } => {
  let s = createEditState(buildBlankLevel({ width: 40, height: 40, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
  s = addLayer(s, 'object', 'fixture');
  const layerId = s.activeLayerId!;
  for (const b of boxes) s = addObject(s, layerId, { type: 'prop', ...b });
  const objects = s.level.layers.find((l) => l.id === layerId)!.objects!;
  boxes.forEach((b, i) => { if (b.rotation) objects[i]!.rotation = b.rotation; });
  return { state: s, refs: objects.map((o) => ({ layerId, objectId: o.id })) };
};
const pos = (s: EditState, refs: ObjectRef[]) => refs.map((r) => { const o = s.level.layers.find((l) => l.id === r.layerId)!.objects!.find((x) => x.id === r.objectId)!; return [o.x, o.y]; });

describe('alignObjects', () => {
  const boxes = [{ x: 10, y: 0, width: 20, height: 10 }, { x: 50, y: 40, width: 40, height: 10 }, { x: 30, y: 80, width: 10, height: 30 }];
  it('E1: x/min sets every left edge to the bounds left, one undo step', () => {
    const { state, refs } = build(boxes);
    const out = alignObjects(state, refs, 'x', 'min');
    expect(pos(out, refs).map((p) => p[0])).toEqual([10, 10, 10]);
    expect(out.past).toHaveLength(state.past.length + 1);
    expect(pos(undo(out), refs)).toEqual(pos(state, refs));
  });
  it('E2: centre aligns footprint centres and max the right edges', () => {
    const { state, refs } = build(boxes);
    // Bounds x 10..90, centre 50.
    expect(pos(alignObjects(state, refs, 'x', 'centre'), refs).map((p, i) => p[0]! + boxes[i]!.width / 2)).toEqual([50, 50, 50]);
    expect(pos(alignObjects(state, refs, 'x', 'max'), refs).map((p, i) => p[0]! + boxes[i]!.width)).toEqual([90, 90, 90]);
    // y/max: bounds bottom 110.
    expect(pos(alignObjects(state, refs, 'y', 'max'), refs).map((p, i) => p[1]! + boxes[i]!.height)).toEqual([110, 110, 110]);
  });
  it('E2: a rotated box aligns by its rotated outline', () => {
    // A 40 x 10 box turned 90 degrees about its origin (100, 0) covers x 90..100, y 0..40.
    const { state, refs } = build([{ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 0, width: 40, height: 10, rotation: 90 }]);
    const out = alignObjects(state, refs, 'x', 'min');
    expect(pos(out, refs)).toEqual([[0, 0], [10, 0]]);
  });
  it('is a no-op when already aligned, for one object, and for stale refs', () => {
    const { state, refs } = build(boxes);
    const aligned = alignObjects(state, refs, 'x', 'min');
    expect(alignObjects(aligned, refs, 'x', 'min')).toBe(aligned);
    expect(alignObjects(state, [refs[0]!], 'x', 'min')).toBe(state);
    expect(alignObjects(state, [{ layerId: 99, objectId: 1 }], 'x', 'min')).toBe(state);
  });
});

describe('distributeObjects', () => {
  it('E3: keeps the extremes and spaces the middle two evenly by centre', () => {
    const { state, refs } = build([0, 10, 100, 300].map((x) => ({ x, y: 0, width: 10, height: 10 })));
    const out = distributeObjects(state, refs, 'x');
    // Centres 5, 15, 105, 305 -> 5, 105, 205, 305.
    expect(pos(out, refs).map((p) => p[0])).toEqual([0, 100, 200, 300]);
    expect(out.past).toHaveLength(state.past.length + 1);
  });
  it('orders by position, not by selection order', () => {
    const { state, refs } = build([0, 300, 10, 100].map((x) => ({ x, y: 0, width: 10, height: 10 })));
    expect(pos(distributeObjects(state, refs, 'x'), refs).map((p) => p[0])).toEqual([0, 300, 100, 200]);
  });
  it('needs three objects, and an even spread is a no-op', () => {
    const { state, refs } = build([0, 100].map((x) => ({ x, y: 0, width: 10, height: 10 })));
    expect(distributeObjects(state, refs, 'x')).toBe(state);
    const even = build([0, 100, 200].map((x) => ({ x, y: 0, width: 10, height: 10 })));
    expect(distributeObjects(even.state, even.refs, 'x')).toBe(even.state);
  });
});
