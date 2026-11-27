// @vitest-environment node
// vitest: placement on the terrain (Phase 141 Theme D) — End / Shift+End, conform on move, scatter, the brush ring. Pure.
import { levelEntityToWorld, SCATTER_STROKE_CAP, type GamePrefab } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, bakeGroundHeight, createEditState, dropToGround, findObject, setOptionalNumber, setVolume, undo, type EditState, type ObjectRef } from '../level-edit-model';
import { scatterDab } from '../level-scatter';
import { matchShortcut } from '../level-shortcuts';
import { buildBlankLevel } from '../new-scene-model';
import { conformElevation, drapedRing, groundUnder, liftItems, ringIndices } from './level-relief';
import { gizmoEdit, gizmoEditGroup, groupPivot, levelWorldItems } from './level-world';

/** 40 × 40 tiles of 32 px, one metre a tile. */
const level3d = () => buildBlankLevel({ width: 40, height: 40, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });
/** A hill rising one metre per metre east and half a metre per metre south. */
const slope = (x: number, z: number): number => 100 + x + z / 2;
const elevationOf = (s: EditState, ref: ObjectRef): unknown => findObject(s.level, ref)?.properties?.find((p) => p.name === 'elevation')?.value;

/** A prop at (4, 4) m with an elevation, a 2 m volume centred on (10, 10) m, and a prop with none at (20, 20) m. */
function scene() {
  let s = createEditState(level3d());
  const layerId = s.level.layers[0]!.id!;
  s = addObject(s, layerId, { type: 'prop', x: 128, y: 128 });
  const prop = s.selection!;
  s = setOptionalNumber(s, prop, 'elevation', '150');
  s = setVolume(s, layerId, { x: 288, y: 288 }, { x: 352, y: 352 });
  const box = s.selection!;
  s = addObject(s, layerId, { type: 'prop', x: 640, y: 640 });
  const flat = s.selection!;
  return { s, prop, box, flat, layerId };
}

describe('dropToGround / bakeGroundHeight (D2)', () => {
  it('End removes elevation from the selection in one undo step', () => {
    const { s, prop, box, flat } = scene();
    const withBox = setOptionalNumber(s, box, 'elevation', '40');
    const dropped = dropToGround(withBox, [prop, box, flat]);
    expect(elevationOf(dropped, prop)).toBeUndefined();
    expect(elevationOf(dropped, box)).toBeUndefined();
    expect(dropped.past.length).toBe(withBox.past.length + 1);
    expect(undo(dropped).level).toBe(withBox.level);
    // Nothing to drop: the same state.
    expect(dropToGround(dropped, [prop, flat])).toBe(dropped);
  });

  it('Shift+End bakes the ground height: a point under its centre, a volume at its lowest footprint corner', () => {
    const { s, prop, box } = scene();
    const baked = bakeGroundHeight(s, [prop, box], (o) => groundUnder(o, s.level, slope));
    expect(elevationOf(baked, prop)).toBeCloseTo(slope(4, 4), 6);
    // The box spans 9..11 m on both axes; its lowest corner is (9, 9).
    expect(elevationOf(baked, box)).toBeCloseTo(slope(9, 9), 6);
    expect(baked.past.length).toBe(s.past.length + 1);
    expect(undo(baked).level).toBe(s.level);
  });

  it('the shortcuts are End and Shift+End in the 3D view only', () => {
    const k = (shiftKey: boolean) => ({ key: 'End', metaKey: false, ctrlKey: false, altKey: false, shiftKey });
    expect(matchShortcut(k(false), { view: '3d', dimension: '3d', mac: false })).toBe('ground.drop');
    expect(matchShortcut(k(true), { view: '3d', dimension: '3d', mac: false })).toBe('ground.bake');
    expect(matchShortcut(k(false), { view: 'plan', dimension: '3d', mac: false })).toBeNull();
  });
});

describe('groundUnder', () => {
  it('turns a footprint with the object before taking the lowest corner', () => {
    const { s, box } = scene();
    const o = findObject(s.level, box)!;
    // Turned 45°: the corners lie on the axes through the centre, √2 m out; the lowest is due west (x = 10 − √2).
    const turned = { ...o, x: 320 - Math.SQRT2 * 32, y: 320, rotation: -45 };
    expect(levelEntityToWorld(turned, s.level).position[0]).toBeCloseTo(10, 6);
    expect(groundUnder(turned, s.level, (x) => x)).toBeCloseTo(10 - Math.SQRT2, 6);
  });
});

describe('conform on move (D3)', () => {
  it('keeps the height above the ground through a drag', () => {
    const from: [number, number] = [4, 4], to: [number, number] = [14, -6];
    const kept = conformElevation(150, from, to, slope);
    expect(kept - slope(...to)).toBeCloseTo(150 - slope(...from), 9);
  });

  it('a single gizmo move written with the conformed elevation keeps the clearance', () => {
    const { s, prop } = scene();
    const to: [number, number] = [12, 6];
    const moved = gizmoEdit(s, prop, { centre: to, elevation: conformElevation(150, [4, 4], to, slope) });
    expect((elevationOf(moved, prop) as number) - slope(...to)).toBeCloseTo(150 - slope(4, 4), 3);
  });

  it('a group move conforms elevated objects and leaves grounded ones grounded', () => {
    const { s, prop, flat } = scene();
    const refs = [prop, flat];
    const pivot = groupPivot(s.level, refs, prop, 'pivot');
    const moved = gizmoEditGroup(s, refs, pivot, { translate: [6, 0, -2] }, slope);
    expect((elevationOf(moved, prop) as number) - slope(10, 2)).toBeCloseTo(150 - slope(4, 4), 3);
    expect(elevationOf(moved, flat)).toBeUndefined();
    // Without conform a flat move keeps the elevation as it was.
    expect(elevationOf(gizmoEditGroup(s, refs, pivot, { translate: [6, 0, -2] }), prop)).toBe(150);
  });
});

describe('scatter on terrain (D4)', () => {
  it('adds objects without elevation, which the view draws on the surface', () => {
    const { s, layerId } = scene();
    const r = scatterDab(s, { layerId, at: { x: 320, y: 320 }, options: { sources: [{ kind: 'model', name: 'tree.glb', weight: 1 }], radius: 200, density: 3, spacing: 20, scale: [1, 1], rotation: [0, 0], seed: 3 }, prefabs: new Map<string, GamePrefab>(), dab: 0, room: SCATTER_STROKE_CAP });
    expect(r.added).toBeGreaterThan(0);
    const before = new Set(levelWorldItems(s.level).map((i) => `${i.sel.layerId}:${i.sel.objectId}`));
    const added = levelWorldItems(r.state.level).filter((i) => !before.has(`${i.sel.layerId}:${i.sel.objectId}`));
    expect(added).toHaveLength(r.added);
    const relief = { heightAt: slope, min: 0, max: 0, fine: null, coarse: null, packs: [] };
    for (const it of liftItems(added, relief)) {
      expect(it.grounded).toBe(true);
      expect(it.position[1]).toBeCloseTo(slope(it.position[0], it.position[2]), 9);
    }
  });
});

describe('the brush ring', () => {
  it('drapes every vertex just above the ground under it', () => {
    const out = drapedRing(new Float32Array(17 * 2 * 3), 10, -4, 4.8, 5, 16, slope, 0.5);
    for (let v = 0; v < 34; v += 1) expect(out[v * 3 + 1]).toBeCloseTo(slope(out[v * 3]!, out[v * 3 + 2]!) + 0.5, 3);
    expect(Math.hypot(out[3]! - 10, out[5]! + 4)).toBeCloseTo(5, 4);
    const idx = ringIndices(16);
    expect(idx).toHaveLength(16 * 6);
    expect(Math.max(...idx)).toBe(33);
  });
});
