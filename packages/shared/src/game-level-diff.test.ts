import { describe, expect, it } from 'vitest';

import { diffLevels, LEVEL_DIFF_TILES_MAX } from './game-level-diff';

const obj = (id: number, over: Record<string, unknown> = {}, props: Array<{ name: string; type?: string; value: unknown }> = []) => ({
  id, name: `o${id}`, type: 'enemy', x: 10, y: 10, width: 0, height: 0, rotation: 0, properties: props, ...over,
});
const level = (objects: unknown[] = [], over: Record<string, unknown> = {}, data: number[] = [0, 0, 0, 0]) => ({
  type: 'map', orientation: 'orthogonal', infinite: false, width: 2, height: 2, tilewidth: 32, tileheight: 32,
  layers: [{ id: 1, type: 'tilelayer', name: 'ground', width: 2, height: 2, data }, { id: 2, type: 'objectgroup', name: 'Objects', objects }],
  tilesets: [], properties: [], ...over,
});

describe('diffLevels (Phase 145 Theme A)', () => {
  it('A1: moving one object is one moved delta with from/to', () => {
    const d = diffLevels(level([obj(1)]), level([obj(1, { x: 50, y: 12 })]));
    expect(d.objects.moved).toEqual([expect.objectContaining({ id: 1, from: { x: 10, y: 10 }, to: { x: 50, y: 12 } })]);
    expect(d.objects.changed).toEqual([]);
    expect(d.summary).toBe('1 moved');
  });

  it('A2: a property change is changed with the field delta; a move plus a property is changed', () => {
    const d = diffLevels(level([obj(1, {}, [{ name: 'hp', value: 3 }]), obj(2)]), level([obj(1, {}, [{ name: 'hp', value: 5 }]), obj(2, { x: 99, type: 'npc' })]));
    expect(d.objects.moved).toEqual([]);
    expect(d.objects.changed.map((c) => c.id)).toEqual([1, 2]);
    expect(d.objects.changed[0]!.fields).toEqual([{ field: 'properties.hp', from: 3, to: 5 }]);
    expect(d.objects.changed[1]!.fields).toEqual(expect.arrayContaining([{ field: 'type', from: 'enemy', to: 'npc' }, { field: 'x', from: 10, to: 99 }]));
  });

  it('lists added and removed objects by id, and layers added or removed', () => {
    const d = diffLevels(level([obj(1), obj(2)]), level([obj(2), obj(3)], { layers: [{ id: 2, type: 'objectgroup', name: 'Objects', objects: [obj(2), obj(3)] }, { id: 9, type: 'objectgroup', name: 'Extra', objects: [] }] }));
    expect(d.objects.added.map((o) => o.id)).toEqual([3]);
    expect(d.objects.removed.map((o) => o.id)).toEqual([1]);
    expect(d.layers).toEqual({ added: ['Extra'], removed: ['ground'] });
  });

  it('A3: tile deltas count every changed cell and list at most 2,000', () => {
    const n = LEVEL_DIFF_TILES_MAX + 500;
    const big = (v: number) => level([], { width: n, height: 1, layers: [{ id: 1, type: 'tilelayer', name: 'ground', width: n, height: 1, data: new Array<number>(n).fill(v) }] });
    const d = diffLevels(big(0), big(7));
    expect(d.tiles).toHaveLength(1);
    expect(d.tiles[0]!.count).toBe(n);
    expect(d.tiles[0]!.cells).toHaveLength(LEVEL_DIFF_TILES_MAX);
    const small = diffLevels(level([], {}, [0, 1, 0, 0]), level([], {}, [0, 1, 0, 5]));
    expect(small.tiles[0]).toEqual({ layer: 'ground', count: 1, cells: [{ index: 3, x: 1, y: 1, from: 0, to: 5 }] });
  });

  it('A4: identical levels give empty lists and "No changes"', () => {
    const d = diffLevels(level([obj(1)]), level([obj(1)]));
    expect(d).toEqual({ objects: { added: [], removed: [], moved: [], changed: [] }, tiles: [], layers: { added: [], removed: [] }, properties: [], links: [], summary: 'No changes' });
  });

  it('reports map property and link changes, and survives non-levels', () => {
    const d = diffLevels(level([obj(1, {}, [{ name: 'midnite.link', value: '2' }])], { properties: [{ name: 'midnite.sky', value: 'day' }] }), level([obj(1, {}, [{ name: 'midnite.link', value: '3' }])], { properties: [{ name: 'midnite.sky', value: 'night' }] }));
    expect(d.properties).toEqual([{ field: 'midnite.sky', from: 'day', to: 'night' }]);
    expect(d.links).toEqual([{ id: 1, name: 'midnite.link', layer: 'Objects', from: '2', to: '3' }]);
    expect(d.objects.changed).toEqual([]);
    expect(diffLevels(null, 'x').summary).toBe('No changes');
  });
});
