import { describe, expect, it } from 'vitest';

import { GamePrefabSchema, instantiatePrefab, PREFAB_PROPS, prefabFromObjects, updateInstances } from './game-level-prefab';

const three = [
  { id: 1, type: 'prop', x: 100, y: 100, width: 20, height: 20 },
  { id: 2, type: 'prop', x: 200, y: 100, width: 20, height: 20, properties: { speed: 3, [PREFAB_PROPS.prefab]: 'old' } },
  { id: 3, type: 'point', x: 140, y: 200, point: true },
];

describe('prefabFromObjects', () => {
  it('E1 pivots at the bounds centre and strips ids and tags', () => {
    const p = prefabFromObjects('trio', '2d', three);
    // bounds x 100..220, y 100..200 -> centre (160, 150)
    expect(p.objects.map((o) => [o.x, o.y])).toEqual([[-60, -50], [40, -50], [-20, 50]]);
    expect(p.objects.every((o) => !('id' in o))).toBe(true);
    expect(p.objects[1]!.properties).toEqual({ speed: 3 });
    expect(GamePrefabSchema.safeParse(p).success).toBe(true);
  });
});

describe('instantiatePrefab', () => {
  it('E2 rotates about the pivot and tags every object', () => {
    const p = prefabFromObjects('trio', '2d', three);
    const out = instantiatePrefab(p, { x: 100, y: 50 }, 90, 'abc12345');
    // offset (-60,-50) rotated 90deg clockwise -> (50, -60)
    expect([out[0]!.x, out[0]!.y]).toEqual([150, -10]);
    expect(out[0]!.rotation).toBe(90);
    expect(out[2]!.properties).toMatchObject({ [PREFAB_PROPS.prefab]: 'trio', [PREFAB_PROPS.instance]: 'abc12345', [PREFAB_PROPS.index]: 2 });
  });
});

describe('updateInstances', () => {
  type Obj = Record<string, unknown> & { properties: Array<{ name: string; value: unknown }> };
  const level = (overrides: string) => ({
    layers: [
      {
        type: 'objectgroup',
        objects: [
          {
            id: 1, type: 'prop', x: 5, y: 6, width: 10, rotation: 90,
            properties: [
              { name: PREFAB_PROPS.prefab, type: 'string', value: 'trio' },
              { name: PREFAB_PROPS.instance, type: 'string', value: 'i' },
              { name: PREFAB_PROPS.index, type: 'int', value: 1 },
              { name: PREFAB_PROPS.overrides, type: 'string', value: overrides },
              { name: 'speed', type: 'int', value: 99 },
            ],
          },
          { id: 2, type: 'prop', x: 0, y: 0 },
        ],
      },
    ],
  });
  const prefab = prefabFromObjects('trio', '2d', three);
  prefab.objects[1]!.width = 64;

  it('E3 changes a non-overridden width and keeps an overridden property', () => {
    const input = level('properties.speed');
    const frozen = JSON.stringify(input);
    const r = updateInstances(input, prefab);
    const o = (r.level as { layers: Array<{ objects: Obj[] }> }).layers[0]!.objects[0]!;
    expect(o.width).toBe(64);
    expect(o.properties.find((p) => p.name === 'speed')!.value).toBe(99);
    expect([o.x, o.y, o.rotation]).toEqual([5, 6, 90]);
    expect(r).toMatchObject({ updated: 1, skippedFields: 1 });
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe('GamePrefabSchema', () => {
  it('E4 rejects an empty objects array and an unsafe name', () => {
    expect(GamePrefabSchema.safeParse({ version: 1, name: 'ok', dimension: '2d', objects: [] }).success).toBe(false);
    expect(GamePrefabSchema.safeParse({ version: 1, name: '../x', dimension: '2d', objects: [{ type: 'prop', x: 0, y: 0 }] }).success).toBe(false);
  });
});
