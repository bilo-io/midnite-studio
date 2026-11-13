// vitest/node: the pure edit model — tiles, objects, layers, undo, serialise, snapping.
import { levelEntityToWorld, parseGameLevel } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIZE_Y,
  UNDO_LIMIT,
  addLayer,
  addObject,
  addPathPoint,
  beginStroke,
  cellCentre,
  createEditState,
  deleteObject,
  endStroke,
  erase,
  fillRect,
  finishPath,
  mapPointToObject,
  moveObject,
  objectToMapPoint,
  paint,
  pick,
  redo,
  removeProperty,
  renameLayer,
  rotateObject,
  rotationToward,
  serialise,
  setObjectField,
  setOptionalNumber,
  setOptionalText,
  setProperty,
  setVolume,
  snapRotation,
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

describe('3D placement (Phase 132 Theme E)', () => {
  const plan = () => createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
  const objectsId = (s: ReturnType<typeof plan>) => s.level.layers.find((l) => l.type === 'objectgroup')!.id!;
  const last = (s: ReturnType<typeof plan>) => s.level.layers.find((l) => l.type === 'objectgroup')!.objects!.at(-1)!;
  const worldOf = (s: ReturnType<typeof plan>, o = last(s)) => levelEntityToWorld(o as never, s.level as never);

  it('turns degrees into Tiled rotation, clockwise from up, and snaps', () => {
    expect(rotationToward({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(0);
    expect(rotationToward({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(rotationToward({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(180);
    expect(rotationToward({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
    expect(snapRotation(52, 15)).toBe(45);
    expect(snapRotation(-10)).toBe(350);
    expect(snapRotation(370, 15)).toBe(15);
  });

  it('writes yaw as Tiled\'s own rotation; the kit yaw is its negation in radians', () => {
    let s = addObject(plan(), objectsId(plan()), { type: 'prop', x: 320, y: 320 });
    s = rotateObject(s, s.selection!, 90);
    expect(last(s).rotation).toBe(90);
    expect(worldOf(s).yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('rotates a footprint about its centre, so its world position does not move', () => {
    let s = plan();
    s = setVolume(s, objectsId(s), { x: 64, y: 96 }, { x: 192, y: 160 });
    const before = worldOf(s).position;
    for (const deg of [30, 90, 200]) {
      s = rotateObject(s, s.selection!, deg);
      const after = worldOf(s).position;
      expect(after[0]).toBeCloseTo(before[0]);
      expect(after[2]).toBeCloseTo(before[2]);
    }
  });

  it('snaps a rotation to the step and is one undo step', () => {
    let s = addObject(plan(), objectsId(plan()), { type: 'prop', x: 10, y: 10 });
    const done = s.past.length;
    s = rotateObject(s, s.selection!, 52, 15);
    expect(last(s).rotation).toBe(45);
    expect(s.past).toHaveLength(done + 1);
    expect(rotateObject(s, s.selection!, 45, 15)).toBe(s);
    expect(last(undo(s)).rotation).toBe(0);
    expect(rotateObject(s, s.selection!, Number.NaN)).toBe(s);
  });

  it('drags a rectangle into a prop box with the default sizeY', () => {
    const s = setVolume(plan(), objectsId(plan()), { x: 192, y: 160 }, { x: 64, y: 96 });
    expect(last(s)).toMatchObject({ type: 'prop', x: 64, y: 96, width: 128, height: 64 });
    expect(last(s).properties).toEqual([{ name: 'sizeY', type: 'float', value: DEFAULT_SIZE_Y }]);
    expect(worldOf(s).size).toEqual([4, 3, 2]);
    expect(s.selection).toEqual({ layerId: objectsId(s), objectId: last(s).id });
    expect(parseGameLevel(serialise(s)).ok).toBe(true);
  });

  it('makes no volume from a click or a line', () => {
    const s = plan();
    expect(setVolume(s, objectsId(s), { x: 5, y: 5 }, { x: 5, y: 5 })).toBe(s);
    expect(setVolume(s, objectsId(s), { x: 5, y: 5 }, { x: 99, y: 5 })).toBe(s);
  });

  it('collects path points, ignores a repeat, and finishes into a polyline relative to the first point', () => {
    let draft = addPathPoint([], { x: 100, y: 200 });
    draft = addPathPoint(draft, { x: 100, y: 200 });
    draft = addPathPoint(draft, { x: 164, y: 200 });
    draft = addPathPoint(draft, { x: 164, y: 264 });
    expect(draft).toHaveLength(3);
    const s0 = plan();
    const s = finishPath(s0, objectsId(s0), draft);
    expect(last(s)).toMatchObject({ type: 'path', x: 100, y: 200, polyline: [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 64 }] });
    expect(last(s).point).toBeUndefined();
    expect(last(undo(s)).type).toBe('spawn');
  });

  it('finishes no path from fewer than two points', () => {
    const s = plan();
    expect(finishPath(s, objectsId(s), [{ x: 1, y: 1 }])).toBe(s);
    expect(finishPath(s, objectsId(s), [])).toBe(s);
  });

  it('sets an optional number, and clearing it removes the property so the kit snaps to ground', () => {
    let s = addObject(plan(), objectsId(plan()), { type: 'prop', x: 320, y: 320 });
    s = setOptionalNumber(s, s.selection!, 'elevation', '2.5');
    expect(worldOf(s).position[1]).toBe(2.5);
    expect(setOptionalNumber(s, s.selection!, 'elevation', 'abc')).toBe(s);
    s = setOptionalNumber(s, s.selection!, 'elevation', '');
    expect(worldOf(s).position[1]).toBeNull();
    expect(last(s).properties ?? []).toEqual([]);
  });

  it('sets a text property (model, collider) and clears it when empty', () => {
    let s = addObject(plan(), objectsId(plan()), { type: 'prop', x: 0, y: 0 });
    s = setOptionalText(s, s.selection!, 'model', 'crate');
    s = setOptionalText(s, s.selection!, 'collider', 'none');
    expect(last(s).properties).toEqual([{ name: 'model', type: 'string', value: 'crate' }, { name: 'collider', type: 'string', value: 'none' }]);
    s = setOptionalText(s, s.selection!, 'model', '');
    expect(last(s).properties).toEqual([{ name: 'collider', type: 'string', value: 'none' }]);
  });
});
