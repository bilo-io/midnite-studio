import { describe, expect, it } from 'vitest';

import { applyLevelOps, levelEntityTypes, LevelOpSchema, queryLevel, type LevelOp } from './game-level-ops';

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') for (const k of Object.values(v)) deepFreeze(k);
  return Object.freeze(v);
};
const base = (props: unknown[] = [], extra: unknown[] = []) => ({
  type: 'map', orientation: 'orthogonal', infinite: false, width: 20, height: 10, tilewidth: 32, tileheight: 32, nextobjectid: 10,
  layers: [
    { id: 1, type: 'tilelayer', name: 'Ground', data: new Array(200).fill(0) },
    {
      id: 2, type: 'objectgroup', name: 'Objects',
      objects: [
        { id: 1, name: 'start', type: 'spawn', x: 32, y: 64, width: 0, height: 0, rotation: 0, visible: true, point: true },
        { id: 9, name: 'Gem', type: 'pickup', x: 320, y: 160, width: 16, height: 16, rotation: 0, visible: true, properties: [{ name: 'value', type: 'int', value: 5 }, { name: 'tag', type: 'string', value: 'a' }] },
        ...extra,
      ],
    },
  ],
  tilesets: [], properties: props,
});
const ctx = { unit: 'px' as const, entityTypes: ['spawn', 'pickup', 'coin'] };
const add = (type: string, x = 100, y = 100, more: Partial<Extract<LevelOp, { op: 'add' }>> = {}): LevelOp => ({ op: 'add', entity: { type, x, y }, ...more });

describe('applyLevelOps', () => {
  it('A1 add returns a fresh id and leaves a frozen input alone', () => {
    const level = deepFreeze(base());
    const before = structuredClone(level);
    const r = applyLevelOps(level, [add('coin', 100, 100, { ref: 'c' })], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toEqual([10]);
    expect(r.refs).toEqual({ c: 10 });
    expect(r.level.nextobjectid).toBe(11);
    expect(level).toEqual(before);
  });

  it('A2 a failing op rejects the whole batch', () => {
    const r = applyLevelOps(base(), [add('coin'), { op: 'update', id: 9999, set: {} }], ctx);
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ index: 1, op: 'update' });
    expect('level' in r).toBe(false);
  });

  it('A3 update merges properties, keeps declared types, unset removes', () => {
    const r = applyLevelOps(base(), [{ op: 'update', id: 9, set: { properties: { value: 7.5, extra: true } }, unset: ['tag'] }], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gem = (r.level.layers as Array<{ objects?: Array<{ id: number; properties: unknown }> }>)[1]!.objects!.find((o) => o.id === 9)!;
    expect(gem.properties).toEqual([{ name: 'value', type: 'int', value: 7.5 }, { name: 'extra', type: 'bool', value: true }]);
    expect(r.updated).toEqual([9]);
  });

  it('A4 delete of unknown id errors, of a known id removes exactly it', () => {
    expect(applyLevelOps(base(), [{ op: 'delete', id: 500 }], ctx).ok).toBe(false);
    const r = applyLevelOps(base(), [{ op: 'delete', id: 9 }], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.level.layers as Array<{ objects?: Array<{ id: number }> }>)[1]!.objects!.map((o) => o.id)).toEqual([1]);
    expect(r.deleted).toEqual([9]);
  });

  it('A5 metres convert with metresPerTile', () => {
    const level = base([{ name: 'midnite.metresPerTile', type: 'float', value: 2 }]);
    const r = applyLevelOps(level, [add('coin', 10, 4, { entity: { type: 'coin', x: 10, y: 4, width: 2 } })], { ...ctx, unit: 'm' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = (r.level.layers as Array<{ objects?: Array<Record<string, number>> }>)[1]!.objects!.at(-1)!;
    expect(o).toMatchObject({ x: 160, y: 64, width: 32 });
  });

  it('A6 unknown type lists the allowed ones', () => {
    const r = applyLevelOps(base(), [add('dragon')], ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.message).toContain('spawn, pickup, coin');
  });

  it('rejects a tile layer target, a far-away position and an unknown layer', () => {
    const msgs = (ops: LevelOp[]) => { const r = applyLevelOps(base(), ops, ctx); return r.ok ? [] : r.errors.map((e) => e.message); };
    expect(msgs([add('coin', 1, 1, { layer: 'Ground' })])[0]).toContain('not an object layer');
    expect(msgs([add('coin', 99999, 1)])[0]).toBe('x = 99999 is outside the level.');
    expect(msgs([add('coin', 1, 1, { layer: 77 })])[0]).toContain('No layer');
  });

  it('ops see earlier ops of the same batch', () => {
    const r = applyLevelOps(base(), [add('coin'), { op: 'update', id: 10, set: { name: 'new' } }, { op: 'delete', id: 10 }], ctx);
    expect(r.ok && r.added).toEqual([10]);
  });

  it('rejects a ref reused in one batch', () => {
    const r = applyLevelOps(base(), [add('coin', 1, 1, { ref: 'a' }), add('coin', 2, 2, { ref: 'a' })], ctx);
    expect(r.ok).toBe(false);
  });

  it('levelEntityTypes follows the dimension', () => {
    expect(levelEntityTypes(base())).not.toContain('prop');
    expect(levelEntityTypes(base([{ name: 'midnite.dimension', type: 'string', value: '3d' }]))).toContain('prop');
  });
});

describe('queryLevel', () => {
  const lvl = base([{ name: 'midnite.metresPerTile', type: 'float', value: 2 }], [{ id: 11, name: 'gem two', type: 'pickup', x: 600, y: 300, width: 0, height: 0 }]);
  it('A7 filters by types, layer, name, region, ids; truncates; reports total', () => {
    expect(queryLevel(lvl, { types: ['pickup'] }).objects.map((o) => o.id)).toEqual([9, 11]);
    expect(queryLevel(lvl, { layer: 'Objects' }).total).toBe(3);
    expect(queryLevel(lvl, { layer: 'Ground' }).total).toBe(0);
    expect(queryLevel(lvl, { name: 'GEM' }).objects.map((o) => o.id)).toEqual([9, 11]);
    expect(queryLevel(lvl, { ids: [1] }).objects[0]!.type).toBe('spawn');
    expect(queryLevel(lvl, { region: { x: 300, y: 150, width: 100, height: 100 } }).objects.map((o) => o.id)).toEqual([9]);
    const cut = queryLevel(lvl, { limit: 1 });
    expect(cut).toMatchObject({ total: 3, truncated: true });
    expect(cut.objects).toHaveLength(1);
  });
  it('unit m converts both ways, and world is 3D only', () => {
    const m = queryLevel(lvl, { unit: 'm', ids: [9] }).objects[0]!;
    expect(m).toMatchObject({ x: 20, y: 10 });
    expect(m.world).toBeUndefined();
    const three = base([{ name: 'midnite.dimension', type: 'string', value: '3d' }]);
    expect(queryLevel(three, { ids: [9] }).objects[0]!.world).toBeDefined();
  });
});

describe('LevelOpSchema', () => {
  const parse = (entity: object) => LevelOpSchema.safeParse({ op: 'add', entity }).success;
  it('A8 rejects NaN, Infinity, long types and long polylines', () => {
    expect(parse({ type: 'coin', x: 1, y: 1 })).toBe(true);
    expect(parse({ type: 'coin', x: NaN, y: 1 })).toBe(false);
    expect(parse({ type: 'coin', x: Infinity, y: 1 })).toBe(false);
    expect(parse({ type: 'x'.repeat(65), x: 1, y: 1 })).toBe(false);
    expect(parse({ type: 'coin', x: 1, y: 1, polyline: Array.from({ length: 1001 }, () => ({ x: 0, y: 0 })) })).toBe(false);
  });
});
