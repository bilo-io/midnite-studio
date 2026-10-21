import { describe, expect, it } from 'vitest';

import { SPRITE_DIRECTIONS } from '../media-sprite';
import {
  orthoFit,
  resolveRenderSettings,
  spriteCameraDirection,
  spriteCameraMatrix,
  spriteDirectionYaw,
  spritePixelOf,
  SPRITE_ISOMETRIC_ELEVATION,
  type SpriteBox,
} from './camera';

const apply = (m: number[], p: [number, number, number]) => [
  m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2],
  m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2],
  m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2],
];

describe('sprite camera presets', () => {
  it('isometric is the exact 2:1 angle, atan(0.5)', () => {
    expect(SPRITE_ISOMETRIC_ELEVATION).toBeCloseTo(26.565, 3);
    expect(resolveRenderSettings({ targetPerspective: 'isometric' }).elevationDeg).toBeCloseTo(26.565, 3);
  });

  it('fills each preset from the perspective; custom keeps its own angles', () => {
    expect(resolveRenderSettings({ targetPerspective: 'side' })).toMatchObject({ camera: 'side', elevationDeg: 0, azimuthDeg: 0, supersample: 4, shading: 'lit' });
    expect(resolveRenderSettings({ targetPerspective: 'top-down' })).toMatchObject({ camera: 'top-down', elevationDeg: 60 });
    expect(resolveRenderSettings({ targetPerspective: 'front' }).camera).toBe('side');
    expect(resolveRenderSettings({ targetPerspective: 'side', render: { camera: 'top-down', elevationDeg: 5 } }).elevationDeg).toBe(60);
    expect(resolveRenderSettings({ targetPerspective: 'side', render: { camera: 'custom', elevationDeg: 40, azimuthDeg: 30 } })).toMatchObject({ elevationDeg: 40, azimuthDeg: 30 });
  });
});

describe('spriteCameraMatrix', () => {
  const side = resolveRenderSettings({ targetPerspective: 'side' });

  it('direction 2 of 8 is yaw +90°, and each direction steps 45°', () => {
    const dirs = SPRITE_DIRECTIONS[8];
    expect(dirs[2]).toBe('w');
    expect(spriteDirectionYaw(side, dirs[2]!)).toBe(90);
    dirs.forEach((d, i) => expect(spriteDirectionYaw(side, d)).toBe(i * 45));
    SPRITE_DIRECTIONS[4].forEach((d, i) => expect(spriteDirectionYaw(side, d)).toBe(i * 90));
  });

  it('s sees the front (+z toward the camera); w turns the front to screen-left; e to screen-right', () => {
    const front: [number, number, number] = [0, 0, 1];
    expect(apply(spriteCameraMatrix(side, 's'), front)[2]).toBeCloseTo(1);
    expect(apply(spriteCameraMatrix(side, 'w'), front)[0]).toBeCloseTo(-1);
    expect(apply(spriteCameraMatrix(side, 'e'), front)[0]).toBeCloseTo(1);
  });

  it('is a rotation for every preset and direction (orthonormal rows)', () => {
    for (const perspective of ['side', 'top-down', 'isometric'] as const) {
      const settings = resolveRenderSettings({ targetPerspective: perspective });
      for (const dir of SPRITE_DIRECTIONS[8]) {
        const m = spriteCameraMatrix(settings, dir);
        const rows = [0, 1, 2].map((r) => [m[r * 4]!, m[r * 4 + 1]!, m[r * 4 + 2]!]);
        for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) expect(rows[a]!.reduce((s, v, k) => s + v * rows[b]![k]!, 0)).toBeCloseTo(0);
        for (const row of rows) expect(Math.hypot(...row)).toBeCloseTo(1);
      }
    }
  });

  it('looks down by the elevation: up stays up, and the camera sits above the target', () => {
    const top = resolveRenderSettings({ targetPerspective: 'top-down' });
    const m = spriteCameraMatrix(top, 's');
    expect(apply(m, [0, 1, 0])[1]).toBeCloseTo(Math.cos(Math.PI / 3));
    expect(spriteCameraDirection(top, 's')[1]).toBeCloseTo(Math.sin(Math.PI / 3));
    // The view direction (camera space −z) is the negated camera direction.
    const dir = spriteCameraDirection(top, 'sw');
    expect(apply(spriteCameraMatrix(top, 'sw'), dir as [number, number, number])[2]).toBeCloseTo(1);
  });
});

describe('orthoFit', () => {
  // A 2 m tall, 0.5 m wide character standing on the origin, in two poses.
  const boxes: SpriteBox[] = [
    { min: [-0.25, 0, -0.15], max: [0.25, 2, 0.15] },
    { min: [-0.3, 0, -0.4], max: [0.3, 1.9, 0.4] },
  ];

  it('keeps one scale across all 8 directions, so a 2 m model is the same pixel height in each', () => {
    const settings = resolveRenderSettings({ targetPerspective: 'side' });
    const views = Object.fromEntries(SPRITE_DIRECTIONS[8].map((d) => [d, spriteCameraMatrix(settings, d)]));
    const fit = orthoFit(boxes, views, [64, 64]);
    const heights = SPRITE_DIRECTIONS[8].map((d) => {
      const foot = spritePixelOf(views[d]!, fit.frusta[d]!, [64, 64], [0, 0, 0]);
      const head = spritePixelOf(views[d]!, fit.frusta[d]!, [64, 64], [0, 2, 0]);
      return foot[1] - head[1];
    });
    for (const h of heights) expect(h).toBeCloseTo(heights[0]!, 6);
    expect(heights[0]).toBeCloseTo(2 / fit.unitsPerPixel, 6);
    // The tallest extent fills 90% of the frame.
    expect(heights[0]).toBeCloseTo(64 * 0.9, 1);
  });

  it('fits every corner of every pose inside the frame', () => {
    const settings = resolveRenderSettings({ targetPerspective: 'isometric' });
    const views = Object.fromEntries(SPRITE_DIRECTIONS[4].map((d) => [d, spriteCameraMatrix(settings, d)]));
    const fit = orthoFit(boxes, views, [48, 32]);
    for (const d of SPRITE_DIRECTIONS[4]) {
      for (const b of boxes) {
        for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
          const [px, py] = spritePixelOf(views[d]!, fit.frusta[d]!, [48, 32], [x, y, z]);
          expect(px).toBeGreaterThanOrEqual(0);
          expect(px).toBeLessThanOrEqual(48);
          expect(py).toBeGreaterThanOrEqual(0);
          expect(py).toBeLessThanOrEqual(32);
        }
      }
    }
  });
});
