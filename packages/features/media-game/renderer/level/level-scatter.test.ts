// vitest: the scatter brush's edit ops (Phase 139 Theme H), pure functions over EditState.
import { describe, expect, it } from 'vitest';
import { SCATTER_STROKE_CAP, type GamePrefab, type ScatterSource } from '@midnite/studio-shared';

import { beginStroke, createEditState, endStroke, prefabInstanceOf, undo, type EditState } from './level-edit-model';
import { eraseDab, scatterDab, type ScatterSettings } from './level-scatter';
import { blankLevel } from './test-helpers';

/** The scattered objects: the blank level's own spawn is left out. */
const objects = (s: EditState) => (s.level.layers.find((l) => l.type === 'objectgroup')!.objects ?? []).filter((o) => o.type !== 'spawn');
const layerId = (s: EditState) => s.level.layers.find((l) => l.type === 'objectgroup')!.id!;
const tree: ScatterSource = { kind: 'model', name: 'tree.glb', weight: 1 };
const rock: ScatterSource = { kind: 'model', name: 'rock.glb', weight: 1 };
const options = (sources: ScatterSource[] = [tree]): ScatterSettings => ({ sources, radius: 100, density: 3, spacing: 10, scale: [0.5, 1.5], rotation: [0, 360], seed: 5 });
const none = new Map<string, GamePrefab>();
const prefab: GamePrefab = { version: 1, name: 'camp', dimension: '2d', objects: [{ type: 'prop', x: 0, y: 0 }, { type: 'prop', x: 10, y: 0 }] };

const start = () => createEditState(blankLevel());
const dab = (s: EditState, at = { x: 200, y: 200 }, n = 0, o = options(), prefabs = none) => scatterDab(s, { layerId: layerId(s), at, options: o, prefabs, dab: n, room: SCATTER_STROKE_CAP });

describe('scatterDab', () => {
  it('adds model props with scale and rotation, inside the brush, leaving the selection alone', () => {
    const r = dab(start());
    expect(r.added).toBeGreaterThan(0);
    for (const o of objects(r.state)) {
      expect(o.type).toBe('prop');
      expect(o.properties?.find((p) => p.name === 'model')?.value).toBe('tree.glb');
      expect(Math.hypot(o.x - 200, o.y - 200)).toBeLessThanOrEqual(100);
    }
    expect(r.state.selected).toEqual([]);
  });
  it('H3: a stroke of three dabs is one undo step', () => {
    let s = beginStroke(start());
    for (let i = 0; i < 3; i++) s = dab(s, { x: 200 + i * 60, y: 200 }, i).state;
    s = endStroke(s);
    expect(objects(s).length).toBeGreaterThan(3);
    expect(objects(undo(s))).toHaveLength(0);
  });
  it('later dabs fill the gaps rather than stacking (existing points are respected)', () => {
    let s = dab(start()).state;
    s = dab(s, { x: 200, y: 200 }, 1).state;
    const os = objects(s);
    for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) expect(Math.hypot(os[i]!.x - os[j]!.x, os[i]!.y - os[j]!.y)).toBeGreaterThanOrEqual(10 - 0.02);
  });
  it('a prefab source stamps one instance per point, each with its own instance id', () => {
    const r = dab(start(), { x: 200, y: 200 }, 0, options([{ kind: 'prefab', name: 'camp', weight: 1 }]), new Map([['camp', prefab]]));
    const instances = new Set(objects(r.state).map((o) => prefabInstanceOf(o)!.instance));
    expect(r.added).toBeGreaterThan(1);
    expect(instances.size).toBe(r.added);
    expect(objects(r.state)).toHaveLength(r.added * 2);
  });
  it('skips a prefab source that is not loaded', () => {
    expect(dab(start(), { x: 0, y: 0 }, 0, options([{ kind: 'prefab', name: 'gone', weight: 1 }])).added).toBe(0);
  });
  it('H5: stops at the room left and says so', () => {
    const r = scatterDab(start(), { layerId: layerId(start()), at: { x: 200, y: 200 }, options: { ...options(), density: 50, spacing: 0 }, prefabs: none, dab: 0, room: 7 });
    expect(r.added).toBe(7);
    expect(r.capped).toBe(true);
    expect(scatterDab(r.state, { layerId: layerId(r.state), at: { x: 0, y: 0 }, options: options(), prefabs: none, dab: 1, room: 0 }).capped).toBe(true);
  });
});

describe('eraseDab', () => {
  it('H4: Alt erases only objects of the chosen sources inside the brush', () => {
    let s = dab(start(), { x: 200, y: 200 }, 0, options([tree])).state;
    s = dab(s, { x: 200, y: 200 }, 1, { ...options([rock]), spacing: 0 }).state;
    const trees = objects(s).filter((o) => o.properties?.some((p) => p.value === 'tree.glb')).length;
    const rocks = objects(s).length - trees;
    const erased = eraseDab(s, { at: { x: 200, y: 200 }, radius: 100, sources: [tree] });
    expect(objects(erased)).toHaveLength(rocks);
    const away = eraseDab(s, { at: { x: 900, y: 900 }, radius: 50, sources: [tree] });
    expect(objects(away)).toHaveLength(objects(s).length);
  });
  it('removes a prefab instance whole when any part is in the brush', () => {
    const s = dab(start(), { x: 200, y: 200 }, 0, options([{ kind: 'prefab', name: 'camp', weight: 1 }]), new Map([['camp', prefab]])).state;
    const first = objects(s)[0]!;
    const erased = eraseDab(s, { at: { x: first.x, y: first.y }, radius: 1, sources: [{ kind: 'prefab', name: 'camp', weight: 1 }] });
    expect(objects(erased)).toHaveLength(objects(s).length - 2);
  });
});
