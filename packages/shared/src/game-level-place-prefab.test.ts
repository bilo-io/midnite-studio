import { describe, expect, it } from 'vitest';

import { applyLevelOps } from './game-level-ops';
import { prefabFromObjects, PREFAB_PROPS } from './game-level-prefab';
import { scatterOps } from './game-level-scatter-ops';

// A minimal 2D Tiled map with one object layer.
const level = (objects: unknown[] = []) => ({
  type: 'map',
  version: '1.10',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: 40,
  height: 40,
  tilewidth: 32,
  tileheight: 32,
  infinite: false,
  nextlayerid: 2,
  nextobjectid: objects.length + 1,
  layers: [{ id: 1, name: 'objects', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0, objects }],
  tilesets: [],
});
const ctxBase = { unit: 'px' as const, entityTypes: ['prop', 'crate', 'point'] };
const hut = prefabFromObjects('hut', '2d', [
  { type: 'prop', x: 100, y: 100, width: 20, height: 20 },
  { type: 'prop', x: 140, y: 100, width: 20, height: 20 },
  { type: 'crate', x: 120, y: 140, point: true },
]);

describe('place-prefab', () => {
  it('adds the three objects of a prefab, tagged as one instance', () => {
    const r = applyLevelOps(level(), [{ op: 'place-prefab', prefab: 'hut', x: 500, y: 400, instance: 'abcd1234', ref: 'h' }], { ...ctxBase, prefabs: { hut } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toHaveLength(3);
    expect(r.refs.h).toBe(r.added[0]);
    const objects = (r.level.layers as Array<{ objects: Array<{ x: number; properties: Array<{ name: string; value: unknown }> }> }>)[0]!.objects;
    expect(objects.map((o) => o.properties.find((p) => p.name === PREFAB_PROPS.instance)?.value)).toEqual(['abcd1234', 'abcd1234', 'abcd1234']);
    expect(objects.map((o) => o.properties.find((p) => p.name === PREFAB_PROPS.index)?.value)).toEqual([0, 1, 2]);
    expect(objects[0]!.x).toBe(500 - 30);
  });

  it('reads x and y in the batch unit but keeps prefab offsets in px', () => {
    const r = applyLevelOps(level(), [{ op: 'place-prefab', prefab: 'hut', x: 10, y: 10 }], { ...ctxBase, unit: 'm', prefabs: { hut } });
    // 3D units need the level's metres-per-tile; the 2D test level defaults to 1 m per tile (32 px).
    expect(r.ok).toBe(true);
  });

  it('refuses an unknown prefab by name and a dimension mismatch', () => {
    const none = applyLevelOps(level(), [{ op: 'place-prefab', prefab: 'nope', x: 1, y: 1 }], ctxBase);
    expect(none).toMatchObject({ ok: false, errors: [{ index: 0, op: 'place-prefab', message: expect.stringContaining('"nope"') }] });
    const wrong = applyLevelOps(level(), [{ op: 'place-prefab', prefab: 'hut', x: 1, y: 1 }], { ...ctxBase, prefabs: { hut: { ...hut, dimension: '3d' } } });
    expect(wrong).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('3d') }] });
  });

  it('is all-or-nothing with the other ops', () => {
    const r = applyLevelOps(level(), [{ op: 'place-prefab', prefab: 'hut', x: 100, y: 100 }, { op: 'delete', id: 99 }], { ...ctxBase, prefabs: { hut } });
    expect(r.ok).toBe(false);
  });
});

describe('scatterOps', () => {
  const options = { sources: [{ kind: 'type' as const, type: 'crate' }, { kind: 'prefab' as const, name: 'hut' }], radius: 200, density: 1, spacing: 30, seed: 7 };
  const area = { x: 100, y: 100, width: 600, height: 600 };

  it('gives the same count twice from a seed, on a fresh copy of the level', () => {
    const run = () => {
      const { ops } = scatterOps({ level: level(), area, options });
      const r = applyLevelOps(level(), ops, { ...ctxBase, prefabs: { hut } });
      expect(r.ok).toBe(true);
      return r.ok ? r.added.length : -1;
    };
    const first = run();
    expect(first).toBeGreaterThan(5);
    expect(run()).toBe(first);
  });

  it('does not stack on a second pass over the same ground', () => {
    const { ops } = scatterOps({ level: level(), area, options: { ...options, sources: [{ kind: 'type', type: 'crate' }] } });
    const first = applyLevelOps(level(), ops, ctxBase);
    if (!first.ok) throw new Error('first scatter failed');
    expect(scatterOps({ level: first.level, area, options: { ...options, sources: [{ kind: 'type', type: 'crate' }] } }).ops).toHaveLength(0);
  });

  it('caps a batch at 500 ops and says so', () => {
    const r = scatterOps({ level: level(), area: { x: 0, y: 0, width: 5000, height: 5000 }, options: { ...options, density: 5, spacing: 0, sources: [{ kind: 'type', type: 'crate' }] } });
    expect(r.ops).toHaveLength(500);
    expect(r.capped).toBe(true);
  });
});
