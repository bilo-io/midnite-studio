// Layer: vitest — pure math, no WebGL/canvas involved. Real coverage for the
// program that actually draws these curves is `knowledge-canvas.spec.ts`'s
// Playwright suite plus the Constellation visual baseline (Decision 6).
import { describe, expect, it } from 'vitest';

import {
  CONSTELLATION_SEGMENTS,
  curveControlPoint,
  curveSign,
  sampleQuadraticBezier,
} from './knowledge-curve-math';

describe('curveControlPoint', () => {
  it('sits on the perpendicular bisector, offset by curvature * length', () => {
    const control = curveControlPoint(0, 0, 10, 0, 0.2);
    // Midpoint is (5, 0); the offset is purely vertical for a horizontal edge.
    expect(control.x).toBeCloseTo(5, 5);
    expect(Math.abs(control.y)).toBeCloseTo(2, 5); // 0.2 * length(10)
  });

  it('degenerates to the midpoint for a zero-length edge, without dividing by zero', () => {
    const control = curveControlPoint(3, 4, 3, 4);
    expect(control).toEqual({ x: 3, y: 4 });
    expect(Number.isFinite(control.x)).toBe(true);
    expect(Number.isFinite(control.y)).toBe(true);
  });

  it('is deterministic — the same endpoints always bow the same way', () => {
    const a = curveControlPoint(1, 2, 8, 9);
    const b = curveControlPoint(1, 2, 8, 9);
    expect(a).toEqual(b);
  });

  it('defaults curvature to a non-zero constant, so an edge always reads as curved', () => {
    const control = curveControlPoint(0, 0, 10, 0);
    expect(control.y).not.toBe(0);
  });
});

describe('curveSign', () => {
  it('returns 1 or -1, never 0', () => {
    for (const [x1, y1, x2, y2] of [
      [0, 0, 1, 1],
      [5, 5, 10, 2],
      [-3, 7, 4, -1],
    ] as const) {
      expect([1, -1]).toContain(curveSign(x1, y1, x2, y2));
    }
  });

  it('is stable for the same endpoints (no per-frame flicker)', () => {
    expect(curveSign(1, 2, 3, 4)).toBe(curveSign(1, 2, 3, 4));
  });
});

describe('sampleQuadraticBezier', () => {
  it('starts at the source and ends at the target', () => {
    const control = { x: 5, y: 2 };
    const points = sampleQuadraticBezier(0, 0, control, 10, 0, 6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 10, y: 0 });
  });

  it('returns segments + 1 points', () => {
    const points = sampleQuadraticBezier(0, 0, { x: 5, y: 5 }, 10, 0, 4);
    expect(points).toHaveLength(5);
  });

  it('defaults to CONSTELLATION_SEGMENTS when no segment count is given', () => {
    const points = sampleQuadraticBezier(0, 0, { x: 5, y: 5 }, 10, 0);
    expect(points).toHaveLength(CONSTELLATION_SEGMENTS + 1);
  });

  it('bows toward the control point rather than tracing the straight line', () => {
    const points = sampleQuadraticBezier(0, 0, { x: 5, y: 10 }, 10, 0, 2);
    // The midpoint sample (t=0.5) is exactly the quadratic Bezier's own
    // formula at t=0.5: 0.25*p0 + 0.5*control + 0.25*p2.
    const mid = points[1]!;
    expect(mid.y).toBeCloseTo(5, 5); // 0.5 * 10
  });
});
