// vitest/node: selection-only helpers — refs, keys, and the map-pixel bounds of a mixed selection.
import { describe, expect, it } from 'vitest';

import { createEditState, addLayer, addObject, selectAllInLayer, type EditLevel } from './level-edit-model';
import { objectExtentPoints, refKey, sameRef, selectionBounds } from './level-selection';
import { buildBlankLevel } from './new-scene-model';

const level = (): { level: EditLevel; layerId: number } => {
  let s = createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
  s = addLayer(s, 'object', 'fixture');
  const layerId = s.activeLayerId!;
  s = addObject(s, layerId, { type: 'prop', x: 10, y: 20, width: 30, height: 40 }); // box
  s = addObject(s, layerId, { type: 'spawn', x: 100, y: 5 }); // point
  s = addObject(s, layerId, { type: 'path', x: 50, y: 60, polyline: [{ x: 0, y: 0 }, { x: 80, y: 90 }] }); // path
  return { level: s.level, layerId };
};

describe('refs', () => {
  it('keys and compares', () => {
    expect(refKey({ layerId: 2, objectId: 7 })).toBe('2:7');
    expect(sameRef({ layerId: 1, objectId: 1 }, { layerId: 1, objectId: 1 })).toBe(true);
    expect(sameRef({ layerId: 1, objectId: 1 }, { layerId: 1, objectId: 2 })).toBe(false);
    expect(sameRef(null, null)).toBe(true);
    expect(sameRef(null, { layerId: 1, objectId: 1 })).toBe(false);
  });
});

describe('selectionBounds', () => {
  const { level: lv, layerId } = level();
  const ids = lv.layers.find((l) => l.id === layerId)!.objects!.map((o) => o.id);
  const ref = (i: number) => ({ layerId, objectId: ids[i]! });

  it('bounds a box, a point and a path', () => {
    expect(selectionBounds(lv, [ref(0)])).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(selectionBounds(lv, [ref(1)])).toEqual({ x: 100, y: 5, width: 0, height: 0 });
    expect(selectionBounds(lv, [ref(2)])).toEqual({ x: 50, y: 60, width: 80, height: 90 });
  });
  it('unions a mix and skips stale refs', () => {
    expect(selectionBounds(lv, [ref(0), ref(1), ref(2), { layerId, objectId: 999 }])).toEqual({ x: 10, y: 5, width: 120, height: 145 });
  });
  it('is null when nothing resolves', () => {
    expect(selectionBounds(lv, [])).toBeNull();
    expect(selectionBounds(lv, [{ layerId: 99, objectId: 1 }])).toBeNull();
  });
  it('a rotated box follows its corners', () => {
    const pts = objectExtentPoints({ x: 0, y: 0, width: 10, height: 20, rotation: 90 });
    expect(pts[1]!.x).toBeCloseTo(0);
    expect(pts[1]!.y).toBeCloseTo(10);
  });
  it('selectAllInLayer bounds equal the union', () => {
    const s = selectAllInLayer(createEditState(lv), layerId);
    expect(selectionBounds(lv, s.selected)).toEqual(selectionBounds(lv, lv.layers.find((l) => l.id === layerId)!.objects!.map((o) => ({ layerId, objectId: o.id }))));
  });
});
