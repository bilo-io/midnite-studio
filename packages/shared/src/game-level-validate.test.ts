import { describe, expect, it } from 'vitest';

import { LEVEL_ISSUES_MAX, validateLevel } from './game-level-validate';

const obj = (id: number, type: string, x = 10, y = 10, props: Array<{ name: string; type: string; value: unknown }> = []) => ({ id, name: '', type, x, y, width: 0, height: 0, rotation: 0, visible: true, properties: props });
const level = (objects: unknown[], props: unknown[] = []) => ({
  type: 'map', orientation: 'orthogonal', infinite: false, width: 10, height: 10, tilewidth: 32, tileheight: 32, nextobjectid: 100,
  layers: [{ id: 1, type: 'objectgroup', name: 'Objects', objects }], tilesets: [], properties: props,
});
const ctx = { entityTypes: ['spawn', 'coin', 'prop'], modelAssets: null };

describe('validateLevel', () => {
  const bad = level([obj(4, 'coin'), obj(4, 'coin'), obj(7, 'dragon')]);

  it('B1 no spawn, duplicate id, unknown type, in the documented order', () => {
    const issues = validateLevel(bad, ctx);
    expect(issues.map((i) => i.rule)).toEqual(['level/duplicate-id', 'level/no-spawn', 'level/unknown-type']);
    expect(issues.map((i) => i.severity)).toEqual(['error', 'error', 'warning']);
    expect(issues[0]!.objectId).toBe(4);
  });

  it('B2 is order independent', () => {
    const shuffled = level([obj(7, 'dragon'), obj(4, 'coin'), obj(4, 'coin')]);
    expect(validateLevel(shuffled, ctx)).toEqual(validateLevel(bad, ctx));
  });

  it('B3 missing-model only for 3D, only when assets are known', () => {
    const three = level([obj(1, 'spawn'), obj(2, 'prop', 10, 10, [{ name: 'model', type: 'string', value: 'barrel' }])], [{ name: 'midnite.dimension', type: 'string', value: '3d' }]);
    expect(validateLevel(three, ctx)).toEqual([]);
    const issues = validateLevel(three, { ...ctx, modelAssets: ['crate'] });
    expect(issues.map((i) => i.rule)).toEqual(['level/missing-model']);
    expect(validateLevel(three, { ...ctx, modelAssets: ['barrel.glb'] })).toEqual([]);
  });

  it('flags out-of-bounds and negative size', () => {
    const l = level([obj(1, 'spawn'), { ...obj(2, 'coin', 9999, 5), width: -4 }]);
    expect(validateLevel(l, ctx).map((i) => i.rule)).toEqual(['level/bad-size', 'level/out-of-bounds']);
  });

  it('a level that does not parse yields only level/parse', () => {
    const issues = validateLevel({ type: 'nope' }, ctx);
    expect(issues.length).toBeGreaterThan(0);
    expect(new Set(issues.map((i) => i.rule))).toEqual(new Set(['level/parse']));
  });

  it('B4 caps the output', () => {
    const many = level(Array.from({ length: LEVEL_ISSUES_MAX + 50 }, (_, i) => obj(i + 1, 'dragon')));
    expect(validateLevel(many, ctx)).toHaveLength(LEVEL_ISSUES_MAX);
  });
});
