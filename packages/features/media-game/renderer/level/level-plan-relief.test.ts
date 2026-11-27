// vitest: the Floorplan's hillshade and elevation readout (Phase 141 Theme E). Pure.
import { gridHeightAt, type GameLevelHeights } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { reliefOf } from './3d/level-relief';
import { elevationReadout, HILLSHADE_MAX_SIDE, planHillshades } from './level-plan-relief';

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

const EXTENT = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };
const hill = (x: number, z: number): number => 300 + 200 * Math.exp(-(x * x + z * z) / 3000);
const terrain = { heights: grid(EXTENT, 21, 21, hill) };
const level = { tilewidth: 32, tileheight: 32, properties: [{ name: 'midnite.originX', type: 'float' as const, value: -50 }] };

describe('planHillshades', () => {
  it('shades each height grid at its own size, packs first and the terrain on top', () => {
    const pack = { name: 'south', ...EXTENT, minZ: 100, maxZ: 300, preview: null, heights: grid({ ...EXTENT, minZ: 100, maxZ: 300 }, 5, 5, () => 50) };
    const shades = planHillshades({ ...terrain, packs: [pack] });
    expect(shades.map((s) => [s.minZ, s.width, s.height])).toEqual([[100, 5, 5], [-100, 21, 21]]);
    expect(shades[1]!.pixels).toHaveLength(21 * 21 * 4);
    // The hill's north-west flank is lit, its south-east flank in shade.
    const at = (i: number, j: number) => shades[1]!.pixels[(j * 21 + i) * 4]!;
    expect(at(7, 7)).toBeGreaterThan(at(13, 13));
    expect(Math.max(...[21, 5])).toBeLessThanOrEqual(HILLSHADE_MAX_SIDE);
  });

  it('is empty without a terrain or heights', () => {
    expect(planHillshades(null)).toEqual([]);
    expect(planHillshades({})).toEqual([]);
  });
});

describe('elevationReadout', () => {
  it('E2: shows the sampler height at the cursor world position, origin included', () => {
    const relief = reliefOf(terrain)!;
    // Map pixel (1600, 320) is 50 m east, 10 m south of the corner; the corner sits at x = −50.
    const text = elevationReadout(level, relief, { x: 1600, y: 320 })!;
    expect(text).toBe(`x 0.0 m · z 10.0 m · elevation ${relief.heightAt(0, 10).toFixed(1)} m`);
    expect(relief.heightAt(0, 10)).toBeCloseTo(gridHeightAt({ ...EXTENT, cols: 21, rows: 21, values: relief.coarse!.values }, 0, 10), 9);
    expect(elevationReadout(level, relief, { x: 0, y: -96 })).toMatch(/^x −50\.0 m · z −3\.0 m · elevation /);
  });

  it('is null without a relief or a pointer', () => {
    expect(elevationReadout(level, null, { x: 0, y: 0 })).toBeNull();
    expect(elevationReadout(level, reliefOf(terrain), null)).toBeNull();
  });
});
