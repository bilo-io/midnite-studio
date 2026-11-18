// vitest/node: Phase 137 Theme B — the pure clipboard ops and the system-clipboard adapter.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addLayer, addObject, createEditState, redo, selectOnly, addSelected, undo, type EditState, type LevelObject } from './level-edit-model';
import { LEVEL_CLIPBOARD_KIND, copySelection, duplicateSelection, parseClipboard, pasteClipboard, readClipboard, reinstance, resetClipboardMemory, writeClipboard } from './level-clipboard';
import { buildBlankLevel } from './new-scene-model';

const fixture = (): { state: EditState; layerId: number } => {
  let s = createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
  s = addLayer(s, 'object', 'fixture');
  const layerId = s.activeLayerId!;
  s = addObject(s, layerId, { type: 'prop', x: 100, y: 200, width: 30, height: 40, properties: [{ name: 'model', type: 'string', value: 'crate' }] });
  s = addObject(s, layerId, { type: 'spawn', x: 160, y: 260 });
  const refs = s.level.layers.find((l) => l.id === layerId)!.objects!.map((o) => ({ layerId, objectId: o.id }));
  return { state: addSelected(selectOnly(s, refs[0]!), [refs[1]!]), layerId };
};
const objectsOf = (s: EditState, layerId: number): LevelObject[] => s.level.layers.find((l) => l.id === layerId)!.objects!;

describe('copySelection', () => {
  it('B1: positions relative to the bounds top-left, ids stripped, deep copies', () => {
    const { state } = fixture();
    const clip = copySelection(state)!;
    expect(clip).toMatchObject({ kind: LEVEL_CLIPBOARD_KIND, version: 1, dimension: '3d', origin: { x: 100, y: 200 } });
    expect(clip.objects.map((o) => [o.id, o.x, o.y])).toEqual([[0, 0, 0], [0, 60, 60]]);
    const original = objectsOf(state, state.selected[0]!.layerId)[0]!;
    expect(clip.objects[0]!.properties).toEqual(original.properties);
    expect(clip.objects[0]!.properties).not.toBe(original.properties);
  });
  it('is null with nothing selected', () => {
    expect(copySelection(selectOnly(fixture().state, null))).toBeNull();
  });
});

describe('pasteClipboard', () => {
  it('B2: adds objects at the point with fresh ids, selects them, one undo step', () => {
    const { state, layerId } = fixture();
    const clip = copySelection(state)!;
    const pasted = pasteClipboard(state, clip, layerId, { x: 100, y: 50 });
    const objs = objectsOf(pasted, layerId);
    expect(objs).toHaveLength(4);
    expect(new Set(objs.map((o) => o.id)).size).toBe(4);
    expect(objs.slice(2).map((o) => [o.x, o.y])).toEqual([[100, 50], [160, 110]]);
    expect(pasted.selected).toHaveLength(2);
    expect(pasted.selected.map((r) => r.objectId)).toEqual(objs.slice(2).map((o) => o.id));
    expect(pasted.selection).toEqual(pasted.selected[1]);
    expect(pasted.past).toHaveLength(state.past.length + 1);
    expect(objectsOf(undo(pasted), layerId)).toHaveLength(2);
    expect(objectsOf(redo(undo(pasted)), layerId)).toHaveLength(4);
  });
  it('pastes into a tile layer or a missing layer as nothing', () => {
    const { state } = fixture();
    const clip = copySelection(state)!;
    expect(pasteClipboard(state, clip, 9999, { x: 0, y: 0 })).toBe(state);
  });
  it('refuses a clipboard from the other dimension', () => {
    const { state, layerId } = fixture();
    expect(pasteClipboard(state, { ...copySelection(state)!, dimension: '2d' }, layerId, { x: 0, y: 0 })).toBe(state);
  });
});

describe('duplicateSelection', () => {
  it('B3: copies at identical positions, selects the copies, one undo step', () => {
    const { state, layerId } = fixture();
    const dup = duplicateSelection(state);
    const objs = objectsOf(dup, layerId);
    expect(objs).toHaveLength(4);
    expect(objs.slice(2).map((o) => [o.x, o.y, o.type])).toEqual(objs.slice(0, 2).map((o) => [o.x, o.y, o.type]));
    expect(dup.selected.map((r) => r.objectId)).toEqual([objs[2]!.id, objs[3]!.id]);
    expect(dup.past).toHaveLength(state.past.length + 1);
  });
  it('is a no-op with nothing selected', () => {
    const { state } = fixture();
    const none = selectOnly(state, null);
    expect(duplicateSelection(none)).toBe(none);
  });
});

describe('parseClipboard', () => {
  it('B4: not json, a wrong kind, a wrong version or a bad shape are null', () => {
    expect(parseClipboard('not json')).toBeNull();
    expect(parseClipboard('null')).toBeNull();
    expect(parseClipboard(JSON.stringify({ kind: 'other', version: 1 }))).toBeNull();
    const good = copySelection(fixture().state)!;
    expect(parseClipboard(JSON.stringify({ ...good, version: 2 }))).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...good, objects: [{ x: 'a' }] }))).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...good, objects: [] }))).toBeNull();
  });
  it('round-trips a clipboard', () => {
    const good = copySelection(fixture().state)!;
    expect(parseClipboard(JSON.stringify(good))).toEqual(good);
  });
});

describe('system clipboard adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetClipboardMemory();
  });
  it('B5: without navigator.clipboard, write then read round-trips through memory', async () => {
    const clip = copySelection(fixture().state)!;
    await writeClipboard(clip);
    expect(await readClipboard()).toEqual(clip);
  });
  it('reads the system clipboard first and falls back to memory when it holds something else', async () => {
    const a = copySelection(fixture().state)!;
    const b = { ...a, origin: { x: 1, y: 2 } };
    let text = '';
    vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (text = t), readText: async () => text } });
    await writeClipboard(a);
    text = JSON.stringify(b);
    expect(await readClipboard()).toEqual(b);
    text = 'hello';
    expect(await readClipboard()).toEqual(a);
  });
  it('never rejects when the clipboard is denied', async () => {
    const clip = copySelection(fixture().state)!;
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('denied'); }, readText: async () => { throw new Error('denied'); } } });
    await writeClipboard(clip);
    expect(await readClipboard()).toEqual(clip);
  });
});

describe('prefab instances (Phase 139 Theme G)', () => {
  const tagged = (instance: string) => [
    { name: 'midnite.prefab', type: 'string' as const, value: 'crate-stack' },
    { name: 'midnite.prefabInstance', type: 'string' as const, value: instance },
  ];
  const instanceOf = (o: LevelObject): unknown => o.properties?.find((p) => p.name === 'midnite.prefabInstance')?.value;

  it('reinstance maps each source instance to one fresh id and leaves plain objects alone', () => {
    let n = 0;
    const out = reinstance(
      [{ properties: tagged('a') }, { properties: tagged('a') }, { properties: tagged('b') }, { properties: [] }],
      () => `new${++n}`,
    );
    expect(out.map((o) => o.properties?.find((p) => p.name === 'midnite.prefabInstance')?.value)).toEqual(['new1', 'new1', 'new2', undefined]);
  });

  it('duplicate gives the copies a new instance id, shared among themselves', () => {
    let s = createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
    s = addLayer(s, 'object', 'fixture');
    const layerId = s.activeLayerId!;
    s = addObject(s, layerId, { type: 'prop', x: 0, y: 0, properties: tagged('orig') });
    s = addObject(s, layerId, { type: 'prop', x: 10, y: 0, properties: tagged('orig') });
    const refs = objectsOf(s, layerId).map((o) => ({ layerId, objectId: o.id }));
    const out = duplicateSelection(addSelected(selectOnly(s, refs[0]!), [refs[1]!]));
    const ids = objectsOf(out, layerId).map(instanceOf);
    expect(ids.slice(0, 2)).toEqual(['orig', 'orig']);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[2]).not.toBe('orig');
  });

  it('paste gives the pasted instance a new id', () => {
    let s = createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
    s = addLayer(s, 'object', 'fixture');
    const layerId = s.activeLayerId!;
    s = addObject(s, layerId, { type: 'prop', x: 0, y: 0, properties: tagged('orig') });
    const ref = { layerId, objectId: objectsOf(s, layerId)[0]!.id };
    const clip = copySelection(selectOnly(s, ref))!;
    const out = pasteClipboard(s, clip, layerId, { x: 50, y: 50 });
    const ids = objectsOf(out, layerId).map(instanceOf);
    expect(ids[0]).toBe('orig');
    expect(ids[1]).not.toBe('orig');
  });
});
