// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cull, formatStats, groundTiles, tileInReach } from './level-cull';
import type { WorldItem } from './level-world';
import { presetFor } from './optimisation';
import { SpatialGrid } from './spatial-grid';

/** A 100 × 100 field of 1 m boxes every 4 m; every tenth has a model, every 50th is a light. */
function field(): WorldItem[] {
  const items: WorldItem[] = [];
  for (let i = 0; i < 10_000; i++) {
    const x = (i % 100) * 4, z = Math.floor(i / 100) * 4;
    items.push({
      index: i,
      sel: { layerId: 1, objectId: i + 1 },
      kind: 'box',
      type: i % 50 === 0 ? 'light' : 'prop',
      position: [x, 0, z],
      yaw: 0,
      pitch: 0,
      roll: 0,
      scale: 1,
      size: [1, 1, 1],
      model: i % 10 === 0 ? 'house' : null,
      bounds: { minX: x - 0.7, minZ: z - 0.7, maxX: x + 0.7, maxZ: z + 0.7 },
    });
  }
  return items;
}

const items = field();
const grid = new SpatialGrid(items);
const base = { items, grid, camera: [200, 20, 220] as const, focus: [200, 0, 200] as const, offset: 0, fovDeg: 50, viewportHeight: 800, inFrustum: () => true };

describe('cull (Phase 136 Themes B and C)', () => {
  it('only considers what the grid has within the draw distance of the focus', () => {
    const r = cull({ ...base, preset: presetFor(5) });
    expect(r.candidates).toBeLessThan(items.length / 2);
    expect(r.boxes.length + r.models.length).toBeLessThanOrEqual(r.candidates);
  });

  it('a performance step draws fewer objects and fewer models than a quality step', () => {
    const q = cull({ ...base, preset: presetFor(1) });
    const p = cull({ ...base, preset: presetFor(5) });
    expect(p.boxes.length + p.models.length).toBeLessThan(q.boxes.length + q.models.length);
    expect(p.models.length).toBeLessThanOrEqual(presetFor(5).maxModels);
    expect(q.models.length).toBeGreaterThan(p.models.length);
    expect(p.lights).toHaveLength(0);
    expect(q.lights.length).toBeLessThanOrEqual(presetFor(1).maxLights);
  });

  it('models go nearest first; the overflow and failed models draw as boxes', () => {
    const r = cull({ ...base, preset: { ...presetFor(1), maxModels: 3 } });
    expect(r.models).toHaveLength(3);
    const d = (i: number) => Math.hypot(items[i]!.position[0] - 200, items[i]!.position[2] - 220);
    expect(d(r.models[0]!)).toBeLessThanOrEqual(d(r.models[2]!));
    const failed = cull({ ...base, preset: presetFor(1), modelFailed: () => true });
    expect(failed.models).toHaveLength(0);
  });

  it('the frustum test and the excluded selection drop items', () => {
    const none = cull({ ...base, preset: presetFor(3), inFrustum: () => false });
    expect(none.boxes).toHaveLength(0);
    const all = cull({ ...base, preset: presetFor(3) });
    const first = all.boxes[0]!;
    expect(cull({ ...base, preset: presetFor(3), exclude: first }).boxes).not.toContain(first);
  });

  it('the dolly offset keeps a far narrow-lens plan camera drawing what is at its focus', () => {
    const far = cull({ ...base, camera: [200, 3000, 200.3], offset: 2900, fovDeg: 2, preset: presetFor(3) });
    expect(far.boxes.length + far.models.length).toBeGreaterThan(0);
    const noOffset = cull({ ...base, camera: [200, 3000, 200.3], offset: 0, fovDeg: 2, preset: presetFor(3) });
    expect(noOffset.boxes.length + noOffset.models.length).toBe(0);
  });
});

describe('ground tiles and the readout', () => {
  it('tiles the bounds and culls tiles past the reach', () => {
    const tiles = groundTiles({ minX: 0, minZ: 0, maxX: 100, maxZ: 50 }, 32);
    expect(tiles).toHaveLength(8);
    expect(tiles.at(-1)).toEqual({ minX: 96, minZ: 32, maxX: 100, maxZ: 50 });
    expect(tileInReach(tiles[0]!, [10, 0, 10], 1)).toBe(true);
    expect(tileInReach(tiles.at(-1)!, [0, 0, 0], 50)).toBe(false);
  });

  it('formats the readout', () => {
    expect(formatStats({ fps: 59.6, calls: 12, triangles: 0, visible: 340, total: 3000, models: 8 })).toBe('60 fps · 12 draw calls · 340 / 3,000 objects · 8 models');
  });
});
