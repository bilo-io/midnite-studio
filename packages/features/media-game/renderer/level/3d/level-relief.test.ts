import { describe, expect, it } from 'vitest';

import type { GameLevelHeights } from '@midnite/studio-shared';

import { buildingWalls, decodeHeights, drapedGrid, drapedRuns, liftItems, reliefOf, reliefPoint, sampleField, tileLines } from './level-relief';
import { buildingsGeometry, groundGeometry, patchGeometry, tileGeometry } from './level-relief-mesh';

/** A wire grid over `extent` whose height in metres is `f(x, z)`, quantised over `[min, max]`. */
function grid(extent: { minX: number; minZ: number; maxX: number; maxZ: number }, cols: number, rows: number, f: (x: number, z: number) => number, min = 0, max = 1000): GameLevelHeights {
  const bytes = new Uint8Array(cols * rows * 2);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = extent.minX + ((extent.maxX - extent.minX) * i) / (cols - 1), z = extent.minZ + ((extent.maxZ - extent.minZ) * j) / (rows - 1);
      const v = Math.round(((f(x, z) - min) / (max - min)) * 65535);
      bytes[(j * cols + i) * 2] = v & 255;
      bytes[(j * cols + i) * 2 + 1] = v >> 8;
    }
  }
  return { ...extent, cols, rows, min, max, data: btoa(String.fromCharCode(...bytes)) };
}
const WHOLE = { minX: -500, minZ: -500, maxX: 500, maxZ: 500 };
const WORK = { minX: 0, minZ: 0, maxX: 100, maxZ: 100 };
const slope = (x: number): number => 100 + x * 0.1;

describe('height fields', () => {
  it('decodes a wire grid to metres and samples between its vertices', () => {
    const f = decodeHeights(grid(WHOLE, 11, 11, slope))!;
    expect(f.values).toHaveLength(121);
    expect(sampleField(f, -500, 0)).toBeCloseTo(50, 1);
    expect(sampleField(f, 250, 123)).toBeCloseTo(125, 1);
    // Outside reads the nearest edge.
    expect(sampleField(f, 9000, 0)).toBeCloseTo(150, 1);
  });
  it('refuses data that does not hold cols × rows samples', () => {
    expect(decodeHeights({ ...grid(WHOLE, 4, 4, slope), cols: 5 })).toBeNull();
    expect(decodeHeights({ ...grid(WHOLE, 4, 4, slope), data: '***' })).toBeNull();
  });
});

describe('reliefOf', () => {
  it('is null with no heights, so the view stays flat', () => {
    expect(reliefOf(null)).toBeNull();
    expect(reliefOf({})).toBeNull();
  });
  it('reads the fine field where it reaches and the coarse one elsewhere', () => {
    const relief = reliefOf({ heights: grid(WHOLE, 11, 11, () => 200), detail: { ...WORK, preview: null, roads: [], buildings: [], heights: grid(WORK, 5, 5, () => 300) } })!;
    expect(relief.heightAt(50, 50)).toBeCloseTo(300, 1);
    expect(relief.heightAt(-300, 50)).toBeCloseTo(200, 1);
    expect(relief.min).toBeCloseTo(200, 1);
    expect(relief.max).toBeCloseTo(300, 1);
  });
  it('reads a further pack where the terrain does not reach, the earlier pack first', () => {
    const north = { minX: 400, minZ: -500, maxX: 2000, maxZ: 500 }, far = { minX: -3000, minZ: -3000, maxX: 3000, maxZ: 3000 };
    const packs = [{ name: 'north', ...north, preview: null, heights: grid(north, 5, 5, () => 400) }, { name: 'far', ...far, preview: null, heights: grid(far, 5, 5, () => 50) }, { name: 'bare', ...far, preview: null }];
    const relief = reliefOf({ heights: grid(WHOLE, 11, 11, () => 200), packs }, 7)!;
    expect(relief.packs).toHaveLength(2);
    expect(relief.heightAt(450, 0)).toBeCloseTo(200, 1); // the terrain lies over the pack
    expect(relief.heightAt(1500, 0)).toBeCloseTo(400, 1);
    expect(relief.heightAt(-2000, 0)).toBeCloseTo(50, 1);
    expect(relief.heightAt(9000, 0)).toBe(7);
    expect(relief.min).toBeCloseTo(50, 1);
    expect(relief.max).toBeCloseTo(400, 1);
    // Packs alone still make a relief.
    expect(reliefOf({ packs })!.heightAt(1500, 0)).toBeCloseTo(400, 1);
  });
  it('gives the stated height past every field', () => {
    expect(reliefOf({ heights: grid(WHOLE, 3, 3, () => 200) }, 7)!.heightAt(9000, 0)).toBe(7);
  });
});

describe('liftItems', () => {
  const relief = reliefOf({ heights: grid(WHOLE, 11, 11, slope) })!;
  it('sits an item with no elevation on the ground under it and leaves the rest', () => {
    const [a, b] = liftItems([{ position: [100, 0, 0] as [number, number, number], grounded: true }, { position: [100, 5, 0] as [number, number, number], grounded: false }], relief);
    expect(a!.position[1]).toBeCloseTo(110, 1);
    expect(b!.position[1]).toBe(5);
  });
  it('changes nothing without a relief', () => {
    const items = [{ position: [1, 2, 3] as [number, number, number], grounded: true }];
    expect(liftItems(items, null)).toBe(items);
  });
});

describe('reliefPoint', () => {
  const relief = { heightAt: (x: number) => (x > 50 ? 40 : 0) };
  it('finds where a ray comes down on flat ground', () => {
    const p = reliefPoint([0, 100, 0], [0, -1, 0], relief)!;
    expect(p[0]).toBeCloseTo(0, 3);
    expect(p[1]).toBe(0);
  });
  it('stops on the hill in front of the plane the flat cast would reach', () => {
    // Slanting down toward +X: the flat plane is met at x = 100, the 40 m step at x ≈ 60.
    const p = reliefPoint([0, 100, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0], relief)!;
    expect(p[0]).toBeCloseTo(60, 0);
    expect(p[1]).toBe(40);
  });
  it('reaches the ground from a camera that frames a whole region', () => {
    // 150 km up, looking down a slant: past the 60 km the march used to stop at.
    const p = reliefPoint([0, 150_000, 0], [-0.6, -0.8, 0], relief)!;
    expect(p[0] / -112_500).toBeCloseTo(1, 3);
    expect(p[1]).toBe(0);
  });
  it('is null from under the ground and for a ray that never comes down', () => {
    expect(reliefPoint([100, 10, 0], [0, -1, 0], relief)).toBeNull();
    expect(reliefPoint([0, 100, 0], [0, 1, 0], relief, 500)).toBeNull();
  });
});

describe('draped lines', () => {
  it('cuts a run into pieces that follow the ground', () => {
    const out = drapedRuns([[0, 0, 100, 0]], (x) => x, 1, 10);
    expect(out).toHaveLength(10 * 6);
    expect(Array.from(out.slice(0, 6))).toEqual([0, 1, 0, 10, 11, 0]);
    expect(out[out.length - 2]).toBe(101);
  });
  it('closes a ring when asked', () => {
    expect(drapedRuns([[0, 0, 4, 0, 4, 4]], () => 0, 0, 100, true)).toHaveLength(3 * 6);
    expect(drapedRuns([[0, 0, 4, 0, 4, 4]], () => 0, 0, 100)).toHaveLength(2 * 6);
  });
  it('lays a grid as lines both ways', () => {
    // 2 × 2 cells: three lines each way, each one piece.
    expect(drapedGrid(0, 0, 2, 2, 10, 20, () => 5, 0)).toHaveLength(6 * 6);
  });
});

describe('ground tiles on a relief', () => {
  it('adds a vertex line at each hole edge inside the tile and none outside it', () => {
    expect(tileLines(0, 100, 4, [30, 250])).toEqual([0, 25, 30, 50, 75, 100]);
    expect(tileLines(0, 100, 2, [50, 0, 100])).toEqual([0, 50, 100]);
  });
  it('follows the ground and sinks only the vertices strictly inside the hole', () => {
    const g = tileGeometry({ minX: 0, minZ: 0, maxX: 100, maxZ: 100 }, WHOLE, () => 10, 4, { minX: 20, minZ: 20, maxX: 80, maxZ: 80, floor: -50 });
    const pos = g.getAttribute('position');
    const at = (x: number, z: number): number => {
      for (let i = 0; i < pos.count; i += 1) if (pos.getX(i) === x && pos.getZ(i) === z) return pos.getY(i);
      throw new Error(`no vertex at ${x}, ${z}`);
    };
    expect(at(0, 0)).toBe(10);
    expect(at(20, 50)).toBe(10); // on the hole's edge
    expect(at(50, 50)).toBe(-50);
    expect(at(80, 80)).toBe(10);
  });
  it('sinks under each of several holes', () => {
    const g = tileGeometry({ minX: 0, minZ: 0, maxX: 100, maxZ: 100 }, { minX: 0, minZ: 0, maxX: 100, maxZ: 100 }, () => 10, 4, [{ minX: -5, minZ: -5, maxX: 30, maxZ: 30, floor: -50 }, { minX: 60, minZ: 60, maxX: 200, maxZ: 200, floor: -70 }]);
    const pos = g.getAttribute('position');
    const at = (x: number, z: number): number => {
      for (let i = 0; i < pos.count; i += 1) if (pos.getX(i) === x && pos.getZ(i) === z) return pos.getY(i);
      return NaN;
    };
    expect(at(25, 25)).toBe(-50);
    expect(at(75, 75)).toBe(-70);
    expect(at(30, 25)).toBe(10); // on a hole's edge: stays up
    expect(at(50, 50)).toBe(10);
  });
  it('maps the picture north up across the whole extent', () => {
    const g = groundGeometry([0, 10], [0, 10], () => 0, { minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
    expect(Array.from(g.getAttribute('uv').array)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  });
  it('builds the fine patch at the asked size, lifted', () => {
    const g = patchGeometry(WORK, 5, 3, (x) => x, 2);
    expect(g.getAttribute('position').count).toBe(15);
    expect(g.getAttribute('position').getY(4)).toBe(102);
  });
});

describe('building volumes', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  it('makes two wall triangles and two edges a side, ignoring a repeated closing point', () => {
    const t: number[] = [], e: number[] = [];
    buildingWalls([...square, 0, 0], 5, 20, t, e);
    expect(t).toHaveLength(4 * 18);
    expect(e).toHaveLength(4 * 12);
    expect(Math.min(...t.filter((_, i) => i % 3 === 1))).toBe(5);
    expect(Math.max(...t.filter((_, i) => i % 3 === 1))).toBe(20);
  });
  it('stands a building from the lowest ground under it to its stated top', () => {
    const out = buildingsGeometry({ buildings: [square], buildingHeights: [105, 12] }, (x) => 100 + x, 0)!;
    const ys = Array.from(out.mesh.getAttribute('position').array).filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(100);
    expect(Math.max(...ys)).toBe(117);
    // Four walls and a two-triangle roof.
    expect(out.mesh.getAttribute('position').count).toBe(4 * 6 + 2 * 3);
  });
  it('stands on the flat ground with no relief, and is null when the pack states no heights', () => {
    const out = buildingsGeometry({ buildings: [square], buildingHeights: [105, 12] }, null, 2)!;
    const ys = Array.from(out.mesh.getAttribute('position').array).filter((_, i) => i % 3 === 1);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([2, 14]);
    expect(buildingsGeometry({ buildings: [square] }, null, 0)).toBeNull();
  });
});
