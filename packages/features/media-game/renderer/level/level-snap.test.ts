import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVEL_SNAP, gizmoSteps, planSnapStep, sanitiseSnap, surfaceElevation } from './level-snap';
import { snapPlan } from './level-plan';

const level = { tilewidth: 32, tileheight: 32, properties: [] };
const box = (objectId: number, x: number, z: number, w: number, h: number, base = 0) => ({
  index: objectId, kind: 'box' as const, sel: { layerId: 1, objectId }, position: [x, base, z] as [number, number, number], size: [w, h, w] as [number, number, number],
  bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - w / 2, maxZ: z + w / 2 },
});

describe('level snap (Phase 137 Theme F)', () => {
  it('F1 planSnapStep: a half tile for 0.5, null for off or disabled', () => {
    expect(planSnapStep(level, { ...DEFAULT_LEVEL_SNAP, planStep: 0.5 })).toEqual({ x: 16, y: 16 });
    expect(planSnapStep(level, { ...DEFAULT_LEVEL_SNAP, planStep: 0 })).toBeNull();
    expect(planSnapStep(level, { ...DEFAULT_LEVEL_SNAP, enabled: false })).toBeNull();
    expect(gizmoSteps({ ...DEFAULT_LEVEL_SNAP, enabled: false })).toEqual({ grid: 0, angle: 0 });
  });

  it('F5 snapPlan lands on half tiles, free with Alt or a null step', () => {
    const step = planSnapStep(level, { ...DEFAULT_LEVEL_SNAP, planStep: 0.5 });
    expect(snapPlan(level, { x: 21, y: 40 }, false, step)).toEqual({ x: 16, y: 48 });
    expect(snapPlan(level, { x: 21, y: 40 }, true, step)).toEqual({ x: 21, y: 40 });
    expect(snapPlan(level, { x: 21, y: 40 }, false, null)).toEqual({ x: 21, y: 40 });
  });

  it('F2 surfaceElevation: the crate top under the footprint, ground over open ground, the mover excluded', () => {
    const crate = box(1, 5, 5, 2, 2);
    const mover = box(2, 5, 5, 1, 1);
    const fp = { minX: 4.5, maxX: 5.5, minZ: 4.5, maxZ: 5.5 };
    expect(surfaceElevation([crate, mover], fp, new Set([2]), 0)).toBe(2);
    expect(surfaceElevation([crate, mover], { minX: 20, maxX: 21, minZ: 20, maxZ: 21 }, new Set([2]), 0)).toBe(0);
    expect(surfaceElevation([mover], fp, new Set([2]), 0)).toBe(0);
  });

  it('F3 sanitiseSnap falls back per field', () => {
    expect(sanitiseSnap({ grid: 3, angle: 45 })).toEqual({ ...DEFAULT_LEVEL_SNAP, angle: 45 });
    expect(sanitiseSnap(null)).toEqual(DEFAULT_LEVEL_SNAP);
  });
});
