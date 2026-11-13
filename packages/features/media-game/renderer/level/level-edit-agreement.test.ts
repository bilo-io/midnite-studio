// @vitest-environment node
import { levelEntityToWorld } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, finishPath, rotateObject, serialise, setOptionalNumber, setVolume } from './level-edit-model';
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
