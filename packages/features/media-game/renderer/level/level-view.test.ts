import { describe, expect, it } from 'vitest';

import { ZOOM_MAX, ZOOM_MIN, fitView, lineCells, screenToMap, zoomAround } from './level-view';

describe('level-view', () => {
  it('keeps the point under the pointer fixed while zooming and clamps 0.25x to 8x', () => {
    const v = { zoom: 1, x: 10, y: 20 };
    const z = zoomAround(v, 2, 110, 120);
    expect(screenToMap(z, 110, 120)).toEqual(screenToMap(v, 110, 120));
    expect(zoomAround(v, 1000, 0, 0).zoom).toBe(ZOOM_MAX);
    expect(zoomAround(v, 0.0001, 0, 0).zoom).toBe(ZOOM_MIN);
    expect(zoomAround({ ...v, zoom: ZOOM_MAX }, 2, 0, 0)).toEqual({ ...v, zoom: ZOOM_MAX });
  });
  it('fits a map centred, never past 2x', () => {
    const v = fitView({ width: 1000, height: 1000 }, 100, 100);
    expect(v.zoom).toBeLessThanOrEqual(2);
    expect(v.x).toBeGreaterThan(0);
  });
  it('draws a gap-free line between cells', () => {
    const cells = lineCells({ x: 0, y: 0 }, { x: 5, y: 2 });
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells.at(-1)).toEqual({ x: 5, y: 2 });
    for (let i = 1; i < cells.length; i += 1) expect(Math.max(Math.abs(cells[i]!.x - cells[i - 1]!.x), Math.abs(cells[i]!.y - cells[i - 1]!.y))).toBe(1);
  });
});
