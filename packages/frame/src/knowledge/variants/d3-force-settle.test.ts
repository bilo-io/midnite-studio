// Layer: vitest — pure settle arithmetic and camera maths, no clock and no canvas.
import { describe, expect, it } from 'vitest';

import { SETTLE, edgeRamp, fitCamera, settleVerdict, zoomAt } from './d3-force-settle';

describe('settleVerdict', () => {
  const base = { ticks: 10, elapsedMs: 100, alpha: 0.5, maxTicks: SETTLE.maxTicks };

  it('keeps running while alpha is hot and neither ceiling is hit', () => {
    expect(settleVerdict(base)).toBe('run');
  });

  it('settles once alpha falls below the convergence point', () => {
    expect(settleVerdict({ ...base, alpha: SETTLE.alphaMin / 2 })).toBe('settled');
  });

  it('hits the tick ceiling even though alpha is still hot', () => {
    expect(settleVerdict({ ...base, ticks: SETTLE.maxTicks })).toBe('ceiling');
  });

  it('hits the time ceiling on a slow machine', () => {
    expect(settleVerdict({ ...base, elapsedMs: SETTLE.maxMs })).toBe('ceiling');
  });

  it('uses the smaller re-settle ceiling when asked', () => {
    expect(settleVerdict({ ...base, ticks: SETTLE.maxTicksResettle, maxTicks: SETTLE.maxTicksResettle })).toBe('ceiling');
  });

  it('reports settled before ceiling when both hold', () => {
    expect(settleVerdict({ ...base, alpha: 0, ticks: 9999 })).toBe('settled');
  });
});

describe('edgeRamp', () => {
  it('runs from 0 to 1 and clamps', () => {
    expect(edgeRamp(0)).toBe(0);
    expect(edgeRamp(60)).toBe(1);
    expect(edgeRamp(500)).toBe(1);
    expect(edgeRamp(30)).toBeGreaterThan(0.5);
  });
});

describe('camera', () => {
  it('fits a box centred in the viewport', () => {
    const camera = fitCamera({ minX: 0, maxX: 200, minY: 0, maxY: 100 }, { width: 400, height: 300 }, 0);
    expect(camera.k).toBe(2);
    expect(camera.x + 100 * camera.k).toBeCloseTo(200);
    expect(camera.y + 50 * camera.k).toBeCloseTo(150);
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const before = { k: 1, x: 10, y: 20 };
    const after = zoomAt(before, 2, 110, 120);
    const world = { x: (110 - before.x) / before.k, y: (120 - before.y) / before.k };
    expect(world.x * after.k + after.x).toBeCloseTo(110);
    expect(world.y * after.k + after.y).toBeCloseTo(120);
  });

  it('clamps the zoom range', () => {
    expect(zoomAt({ k: 11, x: 0, y: 0 }, 5, 0, 0).k).toBe(12);
    expect(zoomAt({ k: 0.03, x: 0, y: 0 }, 0.1, 0, 0).k).toBe(0.02);
  });
});
