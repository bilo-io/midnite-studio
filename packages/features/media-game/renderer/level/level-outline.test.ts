import { describe, expect, it } from 'vitest';

import { addObject, createEditState, selectOnly } from './level-edit-model';
import { buildLevelOutline, objectLabel, rangeRefs } from './level-outline';
import { hitPlan } from './level-plan';
import { clampWidth, OUTLINER_WIDTH, useLevelOutlinerStore } from './level-outliner-store';
import { blankLevel3d } from './test-helpers';
import type { EditLevel } from './level-edit-model';

const make = () => {
  let s = createEditState(blankLevel3d() as EditLevel);
  const layerId = s.level.layers[0]!.id!;
  for (const [type, x] of [['coin', 100], ['coin', 200], ['enemy', 300]] as const) s = addObject(s, layerId, { type, x, y: 100, name: type === 'enemy' ? 'Goblin' : undefined });
  return { s, layerId };
};
const none = new Set<never>();
const opts = (over: Partial<Parameters<typeof buildLevelOutline>[1]> = {}) => ({ query: '', collapsed: new Set<number>(), hidden: new Set<string>(), locked: new Set<string>(), ...over });

describe('buildLevelOutline', () => {
  it('lists layers top first with their objects under them, newest object first', () => {
    const { s } = make();
    const rows = buildLevelOutline(s.level, opts());
    expect(rows[0]).toMatchObject({ kind: 'layer', depth: 0, layerKind: 'object' });
    expect(rows.slice(1).every((r) => r.kind === 'object' && r.depth === 1)).toBe(true);
    const objects = rows.filter((r) => r.kind === 'object');
    expect(objects.map((r) => r.kind === 'object' && r.name)).toEqual(['Goblin', 'coin', 'coin', 'spawn']);
  });

  it('H1: a query keeps only matching objects and their layer rows', () => {
    const { s } = make();
    const rows = buildLevelOutline(s.level, opts({ query: 'COIN' }));
    expect(rows.map((r) => r.kind)).toEqual(['layer', 'object', 'object']);
    expect(buildLevelOutline(s.level, opts({ query: 'gob' })).filter((r) => r.kind === 'object')).toHaveLength(1);
    expect(buildLevelOutline(s.level, opts({ query: 'zzz' }))).toEqual([]);
  });

  it('matches the type as well as the name', () => {
    const { s } = make();
    expect(buildLevelOutline(s.level, opts({ query: 'enemy' })).filter((r) => r.kind === 'object')).toHaveLength(1);
  });

  it('a collapsed layer hides its objects, but a search expands it', () => {
    const { s, layerId } = make();
    expect(buildLevelOutline(s.level, opts({ collapsed: new Set([layerId]) }))).toHaveLength(1);
    expect(buildLevelOutline(s.level, opts({ collapsed: new Set([layerId]), query: 'coin' }))).toHaveLength(3);
  });

  it('marks hidden and locked objects and falls back to "type #id" for an unnamed one', () => {
    const { s, layerId } = make();
    const id = s.level.layers[0]!.objects![1]!.id;
    const rows = buildLevelOutline(s.level, opts({ hidden: new Set([`${layerId}:${id}`]), locked: new Set([`${layerId}:${id}`]) }));
    expect(rows.find((r) => r.kind === 'object' && r.ref.objectId === id)).toMatchObject({ hidden: true, locked: true });
    expect(objectLabel({ id: 7, name: '', type: 'coin' })).toBe('coin #7');
  });

  it('keeps a tile layer as a childless row, dropped while searching', () => {
    const level = { ...blankLevel3d(), layers: [{ id: 9, name: 'ground', type: 'tilelayer', data: [] }, ...blankLevel3d().layers] } as EditLevel;
    const rows = buildLevelOutline(level, opts());
    expect(rows.find((r) => r.kind === 'layer' && r.layerKind === 'tile')).toMatchObject({ count: 0 });
    expect(buildLevelOutline(level, opts({ query: 'coin' })).some((r) => r.kind === 'layer' && r.layerKind === 'tile')).toBe(false);
  });
});

describe('rangeRefs', () => {
  it('H2: the rows between two refs inclusive, in row order', () => {
    const { s } = make();
    const rows = buildLevelOutline(s.level, opts());
    const refs = rows.filter((r) => r.kind === 'object').map((r) => (r.kind === 'object' ? r.ref : null)!);
    expect(rangeRefs(rows, refs[0]!, refs[2]!)).toEqual(refs.slice(0, 3));
    expect(rangeRefs(rows, refs[2]!, refs[0]!)).toEqual([...refs.slice(0, 3)].reverse());
  });

  it('falls back to the clicked ref when the anchor is not a row', () => {
    const { s } = make();
    const rows = buildLevelOutline(s.level, opts());
    const target = { layerId: s.level.layers[0]!.id!, objectId: s.level.layers[0]!.objects![0]!.id };
    expect(rangeRefs(rows, { layerId: 99, objectId: 99 }, target)).toEqual([target]);
  });
});

describe('hide and lock stay out of the level', () => {
  it('hitPlan skips a skipped ref and returns the next hit', () => {
    const { s } = make();
    const o = s.level.layers[0]!.objects![1]!;
    const p = { x: o.x, y: o.y };
    expect(hitPlan(s.level, p, 1)).toMatchObject({ objectId: o.id });
    expect(hitPlan(s.level, p, 1, (r) => r.objectId === o.id)).toBeNull();
  });

  it('toggling hidden never touches the edit state', () => {
    const { s } = make();
    const before = selectOnly(s, null);
    useLevelOutlinerStore.setState({ hiddenByScene: {}, lockedByScene: {} });
    useLevelOutlinerStore.getState().toggleHidden('g/s', ['1:2']);
    expect(useLevelOutlinerStore.getState().hiddenByScene['g/s']).toEqual(['1:2']);
    useLevelOutlinerStore.getState().toggleHidden('g/s', ['1:2']);
    expect(useLevelOutlinerStore.getState().hiddenByScene['g/s']).toBeUndefined();
    expect(before.level).toBe(s.level);
  });

  it('clamps the width to the documented bounds', () => {
    expect(clampWidth(10)).toBe(OUTLINER_WIDTH.min);
    expect(clampWidth(9999)).toBe(OUTLINER_WIDTH.max);
    expect(none.size).toBe(0);
  });
});
