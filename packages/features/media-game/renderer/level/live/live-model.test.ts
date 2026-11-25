// vitest: pure live-ghost mapping (Phase 140 Theme E): E2 connectors, E3 copy live position.
import type { GameEntitySnapshot } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, redo, undo, type EditLevel } from '../level-edit-model';
import { blankLevel, blankLevel3d } from '../test-helpers';
import { authoredPoint, copyLivePosition, ghostLinks, ghostPoint, liveTwin } from './live-model';

const snap = (over: Partial<GameEntitySnapshot>): GameEntitySnapshot => ({ id: null, type: 'enemy', x: 0, y: 0, alive: true, ...over });

function setup3d() {
  let s = createEditState(blankLevel3d() as EditLevel);
  const layerId = s.level.layers[0]!.id!;
  s = addObject(s, layerId, { type: 'enemy', name: 'goblin', x: 64, y: 96, width: 32, height: 32 });
  const object = s.level.layers[0]!.objects!.at(-1)!;
  return { s, ref: { layerId, objectId: object.id }, object };
}

describe('ghostPoint', () => {
  it('maps metres to plan pixels in 3D and keeps pixels in 2D', () => {
    const level = blankLevel3d() as EditLevel; // 32 px a tile, 1 m a tile
    expect(ghostPoint(level, { x: 2, y: 5, z: 3 }, true)).toEqual({ x: 64, y: 96 });
    expect(ghostPoint(blankLevel() as EditLevel, { x: 12, y: 40 }, false)).toEqual({ x: 12, y: 40 });
  });
});

describe('E2 ghostLinks', () => {
  it('links a ghost to its authored object with a dashed connector, from authored centre to live position', () => {
    const { s, object } = setup3d();
    const links = ghostLinks(s.level, [snap({ id: object.id, x: 4, y: 0, z: 4 })], true);
    expect(links).toHaveLength(1);
    expect(links[0]!.from).toEqual(authoredPoint(object, true));
    expect(links[0]!.to).toEqual({ x: 128, y: 128 });
  });
  it('skips runtime-spawned ghosts, unknown ids and a ghost on its spot', () => {
    const { s, object } = setup3d();
    const c = authoredPoint(object, true);
    const onSpot = snap({ id: object.id, x: c.x / 32, y: 0, z: c.y / 32 });
    expect(ghostLinks(s.level, [snap({ id: null }), snap({ id: 9999 }), onSpot], true)).toEqual([]);
  });
  it('finds a live twin by object id', () => {
    const { ref, object } = setup3d();
    expect(liveTwin([snap({ id: 1 }), snap({ id: object.id, name: 'me' })], ref)?.name).toBe('me');
    expect(liveTwin([], ref)).toBeNull();
  });
});

describe('E3 copyLivePosition', () => {
  it('is one undo step and changes only position (3D, footprint kept)', () => {
    const { s, ref, object } = setup3d();
    const next = copyLivePosition(s, ref, snap({ id: object.id, x: 4, y: 1.5, z: 4 }), true);
    expect(next.past.length).toBe(s.past.length + 1);
    const moved = next.level.layers[0]!.objects!.find((o) => o.id === object.id)!;
    expect(moved).toMatchObject({ x: 112, y: 112, width: 32, height: 32, name: 'goblin', type: 'enemy' });
    expect(moved.properties?.find((p) => p.name === 'elevation')?.value).toBe(1.5);
    expect(undo(next).level).toBe(s.level);
    expect(redo(undo(next)).level).toBe(next.level);
  });
  it('2D sets x and y alone and leaves properties untouched', () => {
    let s = createEditState(blankLevel() as EditLevel);
    const layerId = s.level.layers.find((l) => l.type === 'objectgroup')!.id!;
    s = addObject(s, layerId, { type: 'enemy', x: 10, y: 10 });
    const o = s.level.layers.find((l) => l.id === layerId)!.objects!.at(-1)!;
    const next = copyLivePosition(s, { layerId, objectId: o.id }, snap({ id: o.id, x: 70, y: 20 }), false);
    const moved = next.level.layers.find((l) => l.id === layerId)!.objects!.find((x) => x.id === o.id)!;
    expect(moved).toEqual({ ...o, x: 70, y: 20 });
  });
  it('changes nothing when the object is already there', () => {
    const { s, ref, object } = setup3d();
    const c = authoredPoint(object, true);
    expect(copyLivePosition(s, ref, snap({ id: object.id, x: c.x / 32, y: 0, z: c.y / 32 }), true)).toBe(s);
  });
});
