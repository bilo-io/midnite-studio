// vitest/node: plan-view geometry — metres to pixels, footprints, hit-testing, the metre grid.
import { levelEntityToWorld } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, objectCentre, rotateObject, setVolume, type EditLevel } from './level-edit-model';
import { footprintCorners, gridLines, hitPlan, metresToPlan, pathPoints, pixelsPerMetre, snapPlan, terrainRect, yawTipPoint } from './level-plan';
import { buildBlankLevel } from './new-scene-model';

const level3d = (mpt = 1): EditLevel => {
  const l = buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });
  return { ...l, properties: l.properties!.map((p) => (p.name === 'midnite.metresPerTile' ? { ...p, value: mpt } : p)) };
};

describe('plan scale', () => {
  it('maps metres to map pixels through midnite.metresPerTile', () => {
    expect(pixelsPerMetre(level3d(1))).toEqual({ x: 32, z: 32 });
    expect(pixelsPerMetre(level3d(2))).toEqual({ x: 16, z: 16 });
    expect(metresToPlan(level3d(2), 10, 4)).toEqual({ x: 160, y: 64 });
  });

  it('snaps to half a metre unless Alt is held', () => {
    expect(snapPlan(level3d(), { x: 50, y: 70 })).toEqual({ x: 48, y: 64 });
    expect(snapPlan(level3d(), { x: 50, y: 70 }, true)).toEqual({ x: 50, y: 70 });
  });

  it('draws the terrain extent as a pixel rectangle', () => {
    expect(terrainRect(level3d(), { minX: -10, minZ: 0, maxX: 30, maxZ: 20 })).toEqual({ x: -320, y: 0, width: 1280, height: 640 });
  });
});

describe('footprints and the yaw tick', () => {
  it('has corners only for a rectangle, turned about its origin like Tiled', () => {
    expect(footprintCorners({ x: 0, y: 0, width: 0, height: 0 })).toBeNull();
    const c = footprintCorners({ x: 10, y: 10, width: 20, height: 10, rotation: 90 })!;
    expect(c[1]!.x).toBeCloseTo(10);
    expect(c[1]!.y).toBeCloseTo(30);
    expect(c[3]!.x).toBeCloseTo(0);
  });

  it('points the tick the way the object faces: 0 up the screen, 90 to the right', () => {
    const up = yawTipPoint({ x: 100, y: 100 }, 10);
    expect([up.to.x, up.to.y]).toEqual([100, 90]);
    const right = yawTipPoint({ x: 100, y: 100, rotation: 90 }, 10);
    expect(right.to.x).toBeCloseTo(110);
    expect(right.to.y).toBeCloseTo(100);
  });

  it('agrees with levelEntityToWorld on where a footprint is centred', () => {
    const l = level3d(2);
    for (const rotation of [0, 37, 90, 180]) {
      const o = { x: 100, y: 60, width: 64, height: 32, rotation };
      const c = objectCentre(o);
      const world = levelEntityToWorld(o, l as never).position;
      expect(world[0]).toBeCloseTo((c.x / 32) * 2);
      expect(world[2]).toBeCloseTo((c.y / 32) * 2);
    }
  });
});

describe('hitPlan', () => {
  const sel = (level: EditLevel) => level.layers.find((l) => l.type === 'objectgroup')!.id!;

  it('hits a point within reach, shrinking with zoom, and nothing else', () => {
    const level = level3d();
    expect(hitPlan(level, { x: 340, y: 336 }, 1)).toEqual({ layerId: sel(level), objectId: 1 });
    expect(hitPlan(level, { x: 340, y: 336 }, 4)).toBeNull();
    expect(hitPlan(level, { x: 0, y: 0 }, 1)).toBeNull();
  });

  it('hits inside a rotated footprint but not in the corner it left', () => {
    let s = setVolume(createEditState(level3d()), sel(level3d()), { x: 0, y: 0 }, { x: 200, y: 20 });
    s = rotateObject(s, s.selection!, 90);
    const centre = objectCentre(s.level.layers[0]!.objects!.at(-1)!);
    expect(hitPlan(s.level, centre, 1)).not.toBeNull();
    // Unrotated, (190, 10) is inside; after a 90 degree turn the box is tall and narrow.
    expect(hitPlan(s.level, { x: centre.x + 80, y: centre.y }, 1)).toBeNull();
    expect(hitPlan(s.level, { x: centre.x, y: centre.y + 80 }, 1)).not.toBeNull();
  });

  it('hits a path on a segment, and picks the topmost object', () => {
    const level = level3d();
    const id = sel(level);
    let s = createEditState(level);
    s = addObject(s, id, { type: 'path', x: 0, y: 500, polyline: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
    const pathId = s.selection!.objectId;
    expect(pathPoints(s.level.layers[0]!.objects!.at(-1)!)).toEqual([{ x: 0, y: 500 }, { x: 200, y: 500 }]);
    expect(hitPlan(s.level, { x: 100, y: 504 }, 1)).toEqual({ layerId: id, objectId: pathId });
    expect(hitPlan(s.level, { x: 100, y: 540 }, 1)).toBeNull();
  });
});

describe('gridLines', () => {
  it('draws 1 m lines with every tenth bold, across the map', () => {
    const g = gridLines(level3d(), 1);
    expect(g.x).toHaveLength(21);
    expect(g.x.filter((l) => l.bold).map((l) => l.at)).toEqual([0, 320, 640]);
    expect(g.z[1]).toEqual({ at: 32, bold: false });
  });

  it('thins to 10 m lines when zoomed out and to none when too small', () => {
    expect(gridLines(level3d(), 0.1).x.every((l) => l.bold)).toBe(true);
    expect(gridLines(level3d(), 0.01).x).toEqual([]);
  });
});
