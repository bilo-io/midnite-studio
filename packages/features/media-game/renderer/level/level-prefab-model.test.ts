// vitest: the prefab ops of the edit model (Phase 139 Theme G), pure functions over EditState.
import { describe, expect, it } from 'vitest';
import { PREFAB_PROPS, type GamePrefab } from '@midnite/studio-shared';

import {
  addObject,
  applyPrefabUpdate,
  convertToInstance,
  countInstances,
  createEditState,
  findObject,
  instanceRefs,
  overriddenFields,
  placePrefab,
  prefabFromSelection,
  prefabInstanceOf,
  revertOverride,
  selectInstancesOf,
  selectOnly,
  selectPrefabInstance,
  setObjectField,
  setProperty,
  undo,
  unpackInstance,
  addSelected,
  type EditState,
} from './level-edit-model';
import { blankLevel } from './test-helpers';

const objLayer = (s: EditState) => s.level.layers.find((l) => l.type === 'objectgroup')!;
const objs = (s: EditState) => s.level.layers.flatMap((l) => l.objects ?? []);

function withTwoCrates(): EditState {
  let s = createEditState(blankLevel());
  const layerId = objLayer(s).id!;
  s = addObject(s, layerId, { type: 'crate', name: 'crate', x: 10, y: 10, width: 8, height: 8 });
  s = addObject(s, layerId, { type: 'barrel', name: 'barrel', x: 30, y: 10, width: 4, height: 4, properties: [{ name: 'speed', type: 'int', value: 2 }] });
  return s;
}
const selectBoth = (s: EditState): EditState => {
  const [a, b] = objLayer(s).objects!.slice(-2);
  return addSelected(selectOnly(s, { layerId: objLayer(s).id!, objectId: a!.id }), [{ layerId: objLayer(s).id!, objectId: b!.id }]);
};

describe('prefab ops', () => {
  it('G1: save-as converts the selection into one tagged instance, one undo step', () => {
    const s0 = selectBoth(withTwoCrates());
    const prefab = prefabFromSelection(s0, 'stack', '2d')!;
    expect(prefab.objects).toHaveLength(2);
    const s1 = convertToInstance(s0, 'stack', 'abc12345');
    expect(s1.past.length).toBe(s0.past.length + 1);
    const tagged = objs(s1).filter((o) => prefabInstanceOf(o));
    expect(tagged).toHaveLength(2);
    expect(tagged.map((o) => prefabInstanceOf(o)!.index)).toEqual([0, 1]);
    expect(tagged[0]!.properties).toContainEqual({ name: PREFAB_PROPS.instance, type: 'string', value: 'abc12345' });
    expect(objs(undo(s1)).some((o) => prefabInstanceOf(o))).toBe(false);
  });

  it('places an instance as one undo step and selects it', () => {
    const base = selectBoth(withTwoCrates());
    const prefab = prefabFromSelection(base, 'stack', '2d')!;
    const layerId = objLayer(base).id!;
    const s = placePrefab(base, layerId, prefab, { x: 100, y: 100 }, 'i1');
    expect(s.past.length).toBe(base.past.length + 1);
    expect(s.selected).toHaveLength(2);
    expect(countInstances(s.level, 'stack')).toBe(1);
    expect(objs(s).at(-1)).toMatchObject({ type: 'barrel' });
  });

  it('G2: selecting one object selects its siblings; selectOnly (Alt-click) keeps one', () => {
    const s = convertToInstance(selectBoth(withTwoCrates()), 'stack', 'i1');
    const first = { layerId: objLayer(s).id!, objectId: objLayer(s).objects!.at(-2)!.id };
    expect(instanceRefs(s.level, first)).toHaveLength(2);
    expect(selectPrefabInstance(s, first).selected).toHaveLength(2);
    expect(selectOnly(s, first).selected).toHaveLength(1);
    expect(selectInstancesOf(s, 'stack').selected).toHaveLength(2);
  });

  it('G3: editing width adds it to the overrides; revert removes it and restores the prefab value', () => {
    const base = selectBoth(withTwoCrates());
    const prefab = prefabFromSelection(base, 'stack', '2d')!;
    const s = convertToInstance(base, 'stack', 'i1');
    const ref = { layerId: objLayer(s).id!, objectId: objLayer(s).objects!.at(-2)!.id };
    const edited = setObjectField(s, ref, 'width', 99);
    expect(overriddenFields(findObject(edited.level, ref)!)).toEqual(['width']);
    const reverted = revertOverride(edited, ref, 'width', prefab);
    expect(overriddenFields(findObject(reverted.level, ref)!)).toEqual([]);
    expect(findObject(reverted.level, ref)!.width).toBe(8);
  });

  it('tracks property edits as properties.<name> and ignores x, y and plain objects', () => {
    const base = selectBoth(withTwoCrates());
    const prefab = prefabFromSelection(base, 'stack', '2d')!;
    const s = convertToInstance(base, 'stack', 'i1');
    const ref = { layerId: objLayer(s).id!, objectId: objLayer(s).objects!.at(-1)!.id };
    const moved = setObjectField(s, ref, 'x', 500);
    expect(overriddenFields(findObject(moved.level, ref)!)).toEqual([]);
    const tuned = setProperty(moved, ref, 'speed', 'int', 9);
    expect(overriddenFields(findObject(tuned.level, ref)!)).toEqual(['properties.speed']);
    const back = revertOverride(tuned, ref, 'properties.speed', prefab);
    expect(findObject(back.level, ref)!.properties?.find((p) => p.name === 'speed')?.value).toBe(2);
    const plain = setObjectField(withTwoCrates(), { layerId: objLayer(withTwoCrates()).id!, objectId: 1 }, 'width', 3);
    expect(objs(plain).every((o) => overriddenFields(o).length === 0)).toBe(true);
  });

  it('G4: update from prefab keeps overrides and reports the counts', () => {
    const base = selectBoth(withTwoCrates());
    let s = convertToInstance(base, 'stack', 'i1');
    const ref = { layerId: objLayer(s).id!, objectId: objLayer(s).objects!.at(-2)!.id };
    s = setObjectField(s, ref, 'width', 99);
    const prefab: GamePrefab = { ...prefabFromSelection(base, 'stack', '2d')!, objects: prefabFromSelection(base, 'stack', '2d')!.objects.map((o) => ({ ...o, width: 20 })) };
    const r = applyPrefabUpdate(s, prefab);
    expect(r.updated).toBe(2);
    expect(r.skippedFields).toBe(1);
    expect(findObject(r.state.level, ref)!.width).toBe(99);
    expect(r.state.past.length).toBe(s.past.length + 1);
    expect(applyPrefabUpdate(s, { ...prefab, name: 'other' }).state).toBe(s);
  });

  it('unpack removes the tags and the overrides, one undo step', () => {
    let s = convertToInstance(selectBoth(withTwoCrates()), 'stack', 'i1');
    const ref = { layerId: objLayer(s).id!, objectId: objLayer(s).objects!.at(-2)!.id };
    s = setObjectField(s, ref, 'width', 99);
    const u = unpackInstance(s, ref);
    expect(objs(u).some((o) => prefabInstanceOf(o) || overriddenFields(o).length)).toBe(false);
    expect(u.past.length).toBe(s.past.length + 1);
  });
});
