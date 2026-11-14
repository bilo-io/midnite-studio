// @vitest-environment node
import { levelEntityToWorld } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, finishPath, rotateObject, serialise, setOptionalNumber, setVolume } from './level-edit-model';
import { gizmoEdit, groundY, levelWorldItems } from './3d/level-world';
import { buildBlankLevel } from './new-scene-model';

/**
 * Phase 132 Theme E: what the 3D editor writes is what the game builds. The editor's own operations make a level;
 * shared's `levelEntityToWorld` (the inspector's read-only world position) and the kit's `toWorld3d` (what the
 * game builds from) must then agree on every placement in it, at more than one metres-per-tile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (): Promise<any> =>
  // @ts-expect-error TS7016: the kit is plain JS with no declaration file
  import('../../../../../templates/media-game/kit/core/level.js');

describe('the 3D editor and the kit place the same world position (Phase 132 Theme E)', () => {
  it.each([1, 2, 0.5])('metresPerTile %s: editor ops → levelEntityToWorld equals the kit toWorld3d', async (mpt) => {
    const blank = buildBlankLevel({ width: 40, height: 40, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });
    let s = createEditState({ ...blank, properties: blank.properties!.map((p) => (p.name === 'midnite.metresPerTile' ? { ...p, value: mpt } : p)) });
    const layerId = s.level.layers[0]!.id!;
    s = addObject(s, layerId, { type: 'prop', x: 160, y: 96 });
    s = rotateObject(s, s.selection!, 135, 15);
    s = setOptionalNumber(s, s.selection!, 'elevation', '4');
    s = setVolume(s, layerId, { x: 320, y: 64 }, { x: 448, y: 160 });
    s = rotateObject(s, s.selection!, 52);
    s = setOptionalNumber(s, s.selection!, 'pitch', '10');
    s = setVolume(s, layerId, { x: 32, y: 640 }, { x: 96, y: 800 });
    s = finishPath(s, layerId, [{ x: 10, y: 10 }, { x: 74, y: 10 }]);

    const level = serialise(s);
    const { levelEntities, toWorld3d } = await load();
    const kit = levelEntities(level);
    const raw = s.level.layers[0]!.objects!;
    expect(kit).toHaveLength(raw.length);
    for (const [i, entity] of kit.entries()) {
      expect(toWorld3d(entity, level)).toEqual(levelEntityToWorld(raw[i]! as never, level as never));
    }
    // A rotated volume's centre is not its origin: the agreement above is not a trivial one.
    const rotated = raw.find((o) => o.rotation === 52)!;
    expect(levelEntityToWorld(rotated as never, level as never).position[0]).not.toBeCloseTo((rotated.x / 32) * mpt);
  });
});

/**
 * Phase 136: the 3D view draws from `levelWorldItems` and writes through `gizmoEdit`. Both must land where the kit
 * builds: every drawn item sits at the kit's `toWorld3d` placement, and a gizmo drag (move, lift, yaw, pitch)
 * writes Tiled fields the kit reads back to exactly where the gizmo left the object.
 */
describe('the 3D view draws and edits where the kit builds (Phase 136)', () => {
  const levelAt = (mpt: number) => {
    const blank = buildBlankLevel({ width: 40, height: 40, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });
    let s = createEditState({ ...blank, properties: blank.properties!.map((p) => (p.name === 'midnite.metresPerTile' ? { ...p, value: mpt } : p)) });
    const layerId = s.level.layers[0]!.id!;
    s = addObject(s, layerId, { type: 'prop', x: 160, y: 96 });
    s = setOptionalNumber(s, s.selection!, 'elevation', '4');
    s = setVolume(s, layerId, { x: 320, y: 64 }, { x: 448, y: 160 });
    s = rotateObject(s, s.selection!, 52);
    s = setOptionalNumber(s, s.selection!, 'pitch', '10');
    return { s, layerId };
  };

  it.each([1, 2, 0.5])('metresPerTile %s: every drawn item is at the kit toWorld3d placement', async (mpt) => {
    const { s } = levelAt(mpt);
    const level = serialise(s);
    const { levelEntities, toWorld3d } = await load();
    const kit = levelEntities(level);
    const items = levelWorldItems(s.level);
    expect(items).toHaveLength(kit.length);
    for (const [i, entity] of kit.entries()) {
      const w = toWorld3d(entity, level);
      const item = items[i]!;
      expect(item.position[0]).toBeCloseTo(w.position[0], 6);
      expect(item.position[1]).toBeCloseTo(w.position[1] ?? groundY(s.level), 6);
      expect(item.position[2]).toBeCloseTo(w.position[2], 6);
      expect([item.yaw, item.pitch, item.roll]).toEqual([w.yaw, w.pitch, w.roll]);
    }
  });

  it.each([1, 2])('metresPerTile %s: a gizmo move, lift, yaw and pitch is where the kit puts the object', async (mpt) => {
    const { s } = levelAt(mpt);
    const volume = levelWorldItems(s.level)[1]!;
    const edited = gizmoEdit(s, volume.sel, { centre: [7.25, 3.5], elevation: 2.5, yaw: -1.1, pitch: 0.3 });
    expect(edited.past.length).toBe(s.past.length + 1);
    const level = serialise(edited);
    const { levelEntities, toWorld3d } = await load();
    const w = toWorld3d(levelEntities(level)[1], level);
    expect(w.position[0]).toBeCloseTo(7.25, 3);
    expect(w.position[1]).toBeCloseTo(2.5, 3);
    expect(w.position[2]).toBeCloseTo(3.5, 3);
    expect(w.yaw).toBeCloseTo(-1.1, 3);
    expect(w.pitch).toBeCloseTo(0.3, 3);
    // And the 3D view redraws it there.
    const redrawn = levelWorldItems(edited.level)[1]!;
    expect(redrawn.position[0]).toBeCloseTo(7.25, 3);
    expect(redrawn.yaw).toBeCloseTo(-1.1, 3);
  });
});
