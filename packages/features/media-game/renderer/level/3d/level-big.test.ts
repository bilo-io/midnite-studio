// vitest/jsdom: pure maths for a big level's 3D view, no browser capability needed.
import { describe, expect, it } from 'vitest';

import { detailSegments, focusBounds, gridUnit, reachFor, tileSizeFor, workBounds } from './level-big';

const TERRAIN = { minX: -5000, minZ: -5000, maxX: 5000, maxZ: 5000 };
const prop = (name: string, value: number) => ({ name, type: 'float' as const, value });
const gtact = { width: 1600, height: 1400, properties: [prop('midnite.metresPerTile', 1), prop('midnite.originX', -2200), prop('midnite.originY', -3400)] };

describe('where a big level is looked at', () => {
  it('takes the map rectangle and every item as the work', () => {
    expect(workBounds(gtact, [])).toEqual({ minX: -2200, minZ: -3400, maxX: -600, maxZ: -2000 });
    expect(workBounds(gtact, [{ position: [-2500, 0, -1000] }])).toEqual({ minX: -2500, minZ: -3400, maxX: -600, maxZ: -1000 });
  });
  it('opens on the work when the ground dwarfs it, else on the ground', () => {
    const work = workBounds(gtact, []);
    expect(focusBounds(TERRAIN, work)).toEqual(work);
    const near = { minX: -900, minZ: -900, maxX: 900, maxZ: 900 };
    expect(focusBounds(near, { minX: 0, minZ: 0, maxX: 800, maxZ: 800 })).toEqual(near);
  });
});

describe('how far and how coarse', () => {
  it('keeps the preset reach close in and grows it with the camera’s distance', () => {
    expect(reachFor(250, 100)).toBe(250);
    expect(reachFor(250, 2000)).toBe(2500);
  });
  it('never cuts the ground into more than 32 tiles a side', () => {
    expect(tileSizeFor({ minX: 0, minZ: 0, maxX: 200, maxZ: 200 }, 48)).toBe(48);
    expect(tileSizeFor(TERRAIN, 48)).toBe(313);
  });
  it('picks a grid unit to suit the area', () => {
    expect([gridUnit(80), gridUnit(400), gridUnit(1600), gridUnit(10000)]).toEqual([1, 1, 10, 100]);
  });
});

describe('detailSegments', () => {
  it('turns roads into open runs and buildings into closed outlines at the given height', () => {
    const s = detailSegments({ roads: [{ width: 4, points: [0, 0, 10, 0, 10, 5] }], buildings: [[0, 0, 4, 0, 4, 4]] }, 2);
    expect([...s.roads]).toEqual([0, 2, 0, 10, 2, 0, 10, 2, 0, 10, 2, 5]);
    expect(s.buildings.length).toBe(18);
    expect([...s.buildings.slice(12)]).toEqual([4, 2, 4, 0, 2, 0]);
    expect(detailSegments({ roads: [], buildings: [] }, 0).roads.length).toBe(0);
  });
});
