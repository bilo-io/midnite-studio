// vitest/node: the pure edit model — tiles, objects, layers, undo, serialise, snapping.
import { parseGameLevel } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  UNDO_LIMIT,
  addLayer,
  addObject,
  beginStroke,
  cellCentre,
  createEditState,
  deleteObject,
  endStroke,
  erase,
  fillRect,
  mapPointToObject,
  moveObject,
  objectToMapPoint,
  paint,
  pick,
  redo,
  removeProperty,
  renameLayer,
  serialise,
  setObjectField,
  setProperty,
  toEditLevel,
  toggleVisible,
  undo,
  markSaved,
  type EditLevel,
} from './level-edit-model';
import { buildBlankLevel } from './new-scene-model';

const blank = (): EditLevel => buildBlankLevel({ width: 4, height: 3, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: 'ground' });
const state = () => createEditState({ ...blank(), editorsettings: { keep: 'me' }, layers: blank().layers.map((l) => ({ ...l, custom: 1 })) } as EditLevel);

describe('tiles', () => {
  it('paints, erases and fills a rectangle into the right data cells', () => {
    let s = state();
    s = paint(s, 1, [{ x: 1, y: 0 }, { x: 3, y: 2 }], 5);
    expect(s.level.layers[0]!.data).toEqual([0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]);
    s = erase(s, 1, [{ x: 1, y: 0 }]);
    expect(s.level.layers[0]!.data![1]).toBe(0);
    s = fillRect(s, 1, { x: 2, y: 1 }, { x: 0, y: 0 }, 7);
    expect(s.level.layers[0]!.data).toEqual([7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 5]);
    expect(pick(s, 1, { x: 1, y: 1 })).toBe(7);
    expect(pick(s, 1, { x: 9, y: 9 })).toBe(0);
  });

  it('ignores off-map cells and writes that change nothing', () => {
    const s = state();
    expect(paint(s, 1, [{ x: -1, y: 0 }, { x: 4, y: 0 }], 3)).toBe(s);
    expect(erase(s, 1, [{ x: 0, y: 0 }])).toBe(s);
    expect(paint(s, 3, [{ x: 0, y: 0 }], 3)).toBe(s); // an object layer
  });

  it('shares unchanged layers (structural sharing)', () => {
    const s = state();
    const next = paint(s, 1, [{ x: 0, y: 0 }], 2);
    expect(next.level.layers[1]).toBe(s.level.layers[1]);
    expect(next.level.layers[0]).not.toBe(s.level.layers[0]);
  });
});

describe('undo and redo', () => {
  it('round-trips, and a redo is dropped by a new edit', () => {
    let s = state();
    s = paint(s, 1, [{ x: 0, y: 0 }], 2);
    s = paint(s, 1, [{ x: 1, y: 0 }], 2);
    expect(s.dirty).toBe(true);
    s = undo(s);
    expect(s.level.layers[0]!.data![1]).toBe(0);
    s = redo(s);
    expect(s.level.layers[0]!.data![1]).toBe(2);
    s = undo(undo(s));
    expect(s.dirty).toBe(false);
    s = paint(s, 1, [{ x: 2, y: 2 }], 4);
    expect(s.future).toHaveLength(0);
    expect(redo(s)).toBe(s);
  });

  it('caps the stack at 100 and drops the oldest', () => {
    let s = state();
    for (let i = 1; i <= UNDO_LIMIT + 20; i += 1) s = paint(s, 1, [{ x: i % 4, y: 0 }], i);
    expect(s.past).toHaveLength(UNDO_LIMIT);
    for (let i = 0; i < UNDO_LIMIT + 5; i += 1) s = undo(s);
    expect(s.past).toHaveLength(0);
  });

  it('folds a stroke into one undo step', () => {
    let s = beginStroke(state());
    s = paint(s, 1, [{ x: 0, y: 0 }], 2);
    s = paint(s, 1, [{ x: 1, y: 0 }], 2);
    s = paint(s, 1, [{ x: 2, y: 0 }], 2);
    s = endStroke(s);
    expect(s.past).toHaveLength(1);
    expect(undo(s).level.layers[0]!.data!.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('is clean again after saving, dirty after the next edit', () => {
    let s = paint(state(), 1, [{ x: 0, y: 0 }], 2);
    s = markSaved(s);
    expect(s.dirty).toBe(false);
    s = undo(s);
    expect(s.dirty).toBe(true);
    s = redo(s);
    expect(s.dirty).toBe(false);
  });
});

describe('objects', () => {
  it('numbers objects from nextobjectid and bumps it', () => {
    let s = state();
    expect(s.level.nextobjectid).toBe(2);
    s = addObject(s, 3, { type: 'enemy', x: 48, y: 48 });
    s = addObject(s, 3, { type: 'pickup', x: 16, y: 16, name: 'coin' });
    const objects = s.level.layers[2]!.objects!;
    expect(objects.map((o) => o.id)).toEqual([1, 2, 3]);
    expect(s.level.nextobjectid).toBe(4);
    expect(objects[2]).toMatchObject({ name: 'coin', type: 'pickup', point: true });
    expect(s.selection).toEqual({ layerId: 3, objectId: 3 });
  });

  it('moves, edits fields, and deletes (clearing the selection)', () => {
    let s = addObject(state(), 3, { type: 'enemy', x: 48, y: 48 });
    const sel = s.selection!;
    s = moveObject(s, sel, 80, 16);
    s = setObjectField(s, sel, 'name', 'grunt');
    s = setObjectField(s, sel, 'width', 32);
    const o = s.level.layers[2]!.objects![1]!;
    expect(o).toMatchObject({ x: 80, y: 16, name: 'grunt', width: 32 });
    expect(o.point).toBeUndefined();
    expect(setObjectField(s, sel, 'x', Number.NaN)).toBe(s);
    s = deleteObject(s, sel);
    expect(s.level.layers[2]!.objects).toHaveLength(1);
    expect(s.selection).toBeNull();
  });

  it('sets typed properties, rejects bad numbers, and removes them', () => {
    let s = addObject(state(), 3, { type: 'enemy', x: 1, y: 1 });
    const sel = s.selection!;
    s = setProperty(s, sel, 'hp', 'int', '12.7');
    s = setProperty(s, sel, 'speed', 'float', '1.5');
    s = setProperty(s, sel, 'boss', 'bool', 'true');
    s = setProperty(s, sel, 'tag', 'string', 'x');
    expect(s.level.layers[2]!.objects![1]!.properties).toEqual([
      { name: 'hp', type: 'int', value: 12 },
      { name: 'speed', type: 'float', value: 1.5 },
      { name: 'boss', type: 'bool', value: true },
      { name: 'tag', type: 'string', value: 'x' },
    ]);
    expect(setProperty(s, sel, 'hp', 'int', 'abc')).toBe(s);
    s = removeProperty(s, sel, 'tag');
    expect(s.level.layers[2]!.objects![1]!.properties).toHaveLength(3);
    s = setProperty(s, 'map', 'midnite.note', 'string', 'hi');
    expect(s.level.properties!.at(-1)).toEqual({ name: 'midnite.note', type: 'string', value: 'hi' });
  });
});

describe('layers', () => {
  it('adds, renames and toggles layers', () => {
    let s = addLayer(state(), 'tile', 'decor');
    expect(s.level.layers.at(-1)).toMatchObject({ id: 4, type: 'tilelayer', name: 'decor' });
    expect(s.level.layers.at(-1)!.data).toHaveLength(12);
    expect(s.activeLayerId).toBe(4);
    s = addLayer(s, 'object', 'zones');
    expect(s.level.layers.at(-1)).toMatchObject({ id: 5, type: 'objectgroup', objects: [] });
    expect(s.level.nextlayerid).toBe(6);
    s = renameLayer(s, 4, 'props');
    expect(s.level.layers[3]!.name).toBe('props');
    expect(renameLayer(s, 4, '  ')).toBe(s);
    s = toggleVisible(s, 4);
    expect(s.level.layers[3]!.visible).toBe(false);
    s = toggleVisible(s, 4);
    expect(s.level.layers[3]!.visible).toBe(true);
  });

  it('gives hand-written layers without ids stable ids', () => {
    const s = createEditState({ ...blank(), layers: blank().layers.map(({ id: _id, ...l }) => l as never), nextlayerid: undefined });
    expect(s.level.layers.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(s.dirty).toBe(false);
  });
});

describe('serialise', () => {
  it('keeps every field it did not touch and still parses as a level', () => {
    let s = state();
    s = paint(s, 1, [{ x: 0, y: 0 }], 2);
    s = addObject(s, 3, { type: 'exit', x: 16, y: 16 });
    const out = serialise(s);
    expect((out as Record<string, unknown>).editorsettings).toEqual({ keep: 'me' });
    expect((out.layers[0] as Record<string, unknown>).custom).toBe(1);
    expect(parseGameLevel(out).ok).toBe(true);
  });

  it('adds nextobjectid when the file had none', () => {
    const { nextobjectid: _n, ...rest } = blank();
    const out = serialise(createEditState(rest as EditLevel));
    expect(out.nextobjectid).toBe(2);
  });
});

describe('toEditLevel', () => {
  it('accepts a map and refuses what is not one', () => {
    expect(toEditLevel(blank())).not.toBeNull();
    expect(toEditLevel(null)).toBeNull();
    expect(toEditLevel({ type: 'map' })).toBeNull();
    expect(toEditLevel({ ...blank(), orientation: 'hexagonal' })).toBeNull();
  });
});

describe('geometry', () => {
  it('snaps to cell centres on both orientations and round-trips map points', () => {
    const ortho = blank();
    expect(cellCentre(ortho, { x: 1, y: 2 })).toEqual({ x: 48, y: 80 });
    const iso = { orientation: 'isometric' as const, height: 5, tilewidth: 64, tileheight: 32 };
    const c = cellCentre(iso, { x: 2, y: 3 });
    expect(c).toEqual({ x: 80, y: 112 });
    const back = mapPointToObject(iso, objectToMapPoint(iso, c.x, c.y).x, objectToMapPoint(iso, c.x, c.y).y);
    expect(back.x).toBeCloseTo(c.x);
    expect(back.y).toBeCloseTo(c.y);
    expect(mapPointToObject(ortho, 10, 20)).toEqual({ x: 10, y: 20 });
  });
});
