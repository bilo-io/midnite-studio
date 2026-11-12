import { describe, expect, it } from 'vitest';

import { cellAt, clampZoom, fillImage, lineCells, paintCells, stampPattern } from './grid';

describe('grid helpers', () => {
  it('maps a pointer to a cell and rejects points outside', () => {
    const rect = { left: 10, top: 20, width: 100, height: 100 };
    expect(cellAt(10, 20, rect, 10, 10)).toEqual([0, 0]);
    expect(cellAt(109, 119, rect, 10, 10)).toEqual([9, 9]);
    expect(cellAt(9, 50, rect, 10, 10)).toBeNull();
    expect(cellAt(50, 120, rect, 10, 10)).toBeNull();
  });

  it('draws a gap-free line', () => {
    const line = lineCells([0, 0], [5, 2]);
    expect(line[0]).toEqual([0, 0]);
    expect(line.at(-1)).toEqual([5, 2]);
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]![0] - line[i - 1]![0])).toBeLessThanOrEqual(1);
      expect(Math.abs(line[i]![1] - line[i - 1]![1])).toBeLessThanOrEqual(1);
    }
  });

  it('paints, counts changes and ignores out-of-range cells', () => {
    const g = new Uint8Array(16);
    expect(paintCells(g, 4, 4, [[1, 1], [1, 1], [9, 9]], 1)).toBe(1);
    expect(g[5]).toBe(1);
    expect(paintCells(g, 4, 4, [[1, 1]], 0)).toBe(1);
    expect(g[5]).toBe(0);
  });

  it('stamps a pattern wrapping at the edge', () => {
    const g = new Uint8Array(16);
    stampPattern(g, 4, 4, [[0, 0], [1, 0]], 3, 3);
    expect(g[15]).toBe(1);
    expect(g[12]).toBe(1);
  });

  it('fills an image from a snapshot and clamps zoom', () => {
    const image = { data: new Uint8ClampedArray(8) };
    fillImage(image, [1, 0], 2);
    expect(Array.from(image.data.slice(0, 4))).toEqual([129, 140, 248, 255]);
    expect(image.data[7]).toBe(255);
    expect(clampZoom(40)).toBe(16);
    expect(clampZoom(0.2)).toBe(1);
  });
});
