// vitest/node: plan-view geometry — metres to pixels, footprints, hit-testing, the metre grid.
import { levelEntityToWorld } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, objectCentre, rotateObject, setVolume, type EditLevel } from './level-edit-model';
import { footprintCorners, gridLines, hitPlan, metresToPlan, pathPoints, pixelsPerMetre, planBounds, snapPlan, terrainRect, yawTipPoint } from './level-plan';
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

describe('a level centred on the origin (negative pixels)', () => {
  const centred = (): EditLevel => {
    let s = createEditState(level3d());
    const id = s.level.layers[0]!.id!;
    s = addObject(s, id, { type: 'prop', x: -320, y: -192 });
    s = setVolume(s, id, { x: -640, y: -96 }, { x: -480, y: 32 });
    return s.level;
  };

  it('bounds the map, every object and the terrain, not just the map frame', () => {
    expect(planBounds(level3d())).toEqual({ minX: 0, minY: 0, maxX: 640, maxY: 640 });
    expect(planBounds(centred())).toEqual({ minX: -640, minY: -192, maxX: 640, maxY: 640 });
    expect(planBounds(level3d(), { minX: -30, minZ: -20, maxX: 5, maxZ: 5 })).toEqual({ minX: -960, minY: -640, maxX: 640, maxY: 640 });
  });

  it('hits points and footprints at negative coordinates', () => {
    const level = centred();
    const id = level.layers[0]!.id!;
    const objects = level.layers[0]!.objects!;
    expect(hitPlan(level, { x: -318, y: -190 }, 1)).toEqual({ layerId: id, objectId: objects[1]!.id });
    expect(hitPlan(level, { x: -560, y: -30 }, 1)).toEqual({ layerId: id, objectId: objects[2]!.id });
    expect(hitPlan(level, { x: -560, y: 200 }, 1)).toBeNull();
  });

  it('snaps to the half metre on both sides of zero', () => {
    expect(snapPlan(level3d(), { x: -50, y: -70 })).toEqual({ x: -48, y: -64 });
    expect(snapPlan(level3d(), { x: -8, y: 8 })).toEqual({ x: 0, y: 16 });
  });

  it('grids negative metres, with the bold lines on every tenth including 0 and -10', () => {
    const g = gridLines(level3d(), 1, 6, { minX: -640, minY: -192, maxX: 640, maxY: 640 });
    expect(g.x[0]).toEqual({ at: -640, bold: true });
    expect(g.x.filter((l) => l.bold).map((l) => l.at)).toEqual([-640, -320, 0, 320, 640]);
    expect(g.z[0]).toEqual({ at: -192, bold: false });
  });
});
