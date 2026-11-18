import { describe, expect, it } from 'vitest';

import { planViewArea, viewDetailArea, VIEW_DETAIL_MAX_VIEW } from './level-view-detail';

describe('viewDetailArea', () => {
  it('asks for nothing with no view or an overview', () => {
    expect(viewDetailArea(null)).toBeNull();
    expect(viewDetailArea({ minX: 0, minZ: 0, maxX: VIEW_DETAIL_MAX_VIEW + 1, maxZ: 100 })).toBeNull();
    expect(viewDetailArea({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 })).toBeNull();
  });
  it('always holds the view, and stays put for a small pan or zoom', () => {
    const view = { minX: -2400, minZ: -2700, maxX: -1500, maxZ: -2100 };
    const area = viewDetailArea(view)!;
    // 900 m of view is in the 1024 m class: a 1536 m square on a 256 m grid.
    expect(area.maxX - area.minX).toBe(1536);
    expect(Math.abs(area.minX % 256)).toBe(0);
    for (const v of [view, { minX: -2380, minZ: -2690, maxX: -1490, maxZ: -2095 }, { minX: -2350, minZ: -2650, maxX: -1550, maxZ: -2150 }]) {
      const a = viewDetailArea(v)!;
      expect(a).toEqual(area);
      expect(a.minX <= v.minX && a.maxX >= v.maxX && a.minZ <= v.minZ && a.maxZ >= v.maxZ).toBe(true);
    }
    // A long pan lands in another cell.
    expect(viewDetailArea({ minX: 9000, minZ: 9000, maxX: 9900, maxZ: 9600 })).not.toEqual(area);
  });
  it('never asks for more than the reader allows', () => {
    const a = viewDetailArea({ minX: 0, minZ: 0, maxX: VIEW_DETAIL_MAX_VIEW, maxZ: 10 })!;
    expect(a.maxX - a.minX).toBeLessThanOrEqual(12_000);
  });
});

describe('planViewArea', () => {
  it('is the world rectangle the canvas shows', () => {
    // 32 px per metre at zoom 1; zoom 0.5 shows twice the ground. The map's corner is at world (-100, 50).
    const area = planViewArea({ x: 320, y: 0, zoom: 0.5 }, { width: 640, height: 320 }, { tilewidth: 32, tileheight: 32, mpt: 1, originX: -100, originZ: 50 });
    expect(area).toEqual({ minX: -120, minZ: 50, maxX: -80, maxZ: 70 });
  });
});
