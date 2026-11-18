import { describe, expect, it } from 'vitest';

import { mulberry32, scatterPoints, type ScatterOptions } from './game-level-scatter';

const base: ScatterOptions = { sources: [{ kind: 'type', type: 'prop', weight: 1 }], radius: 100, density: 5, spacing: 20, scale: [1, 1], rotation: [0, 360], seed: 7 };
const square = { x: 0, y: 0, width: 1000, height: 1000 };

describe('scatterPoints', () => {
  it('H1: a fixed seed returns the same points every run, none closer than spacing', () => {
    const a = scatterPoints(square, { ...base, density: 1 }, []);
    const b = scatterPoints(square, { ...base, density: 1 }, []);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(50);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y)).toBeGreaterThanOrEqual(20);
  });
  it('a different seed gives different points', () => {
    expect(scatterPoints(square, { ...base, density: 1, seed: 1 }, [])).not.toEqual(scatterPoints(square, { ...base, density: 1, seed: 2 }, []));
  });
  it('H2: density 1 over 1000 x 1000 yields at most 100 points', () => {
    expect(scatterPoints(square, { ...base, density: 1, spacing: 0 }, [])).toHaveLength(100);
    expect(scatterPoints(square, { ...base, density: 1, spacing: 50 }, []).length).toBeLessThanOrEqual(100);
  });
  it('stays inside a circle', () => {
    for (const p of scatterPoints({ cx: 500, cy: 500, radius: 100 }, { ...base, density: 20, spacing: 0 }, [])) expect(Math.hypot(p.x - 500, p.y - 500)).toBeLessThanOrEqual(100);
  });
  it('respects existing points within spacing and tops up rather than stacking', () => {
    const first = scatterPoints({ cx: 0, cy: 0, radius: 200 }, base, []);
    const second = scatterPoints({ cx: 0, cy: 0, radius: 200 }, base, first);
    for (const p of second) for (const e of first) expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeGreaterThanOrEqual(20);
    expect(first.length + second.length).toBeLessThanOrEqual(Math.floor((5 * Math.PI * 200 * 200) / 10_000));
  });
  it('draws scale and rotation inside their ranges and every source by weight', () => {
    const pts = scatterPoints(square, { ...base, density: 2, spacing: 0, scale: [0.5, 2], rotation: [10, 20], sources: [{ kind: 'prefab', name: 'a', weight: 1 }, { kind: 'model', name: 'b.glb', weight: 1 }] }, []);
    for (const p of pts) {
      expect(p.scale).toBeGreaterThanOrEqual(0.5);
      expect(p.scale).toBeLessThanOrEqual(2);
      expect(p.rotation).toBeGreaterThanOrEqual(10);
      expect(p.rotation).toBeLessThanOrEqual(20);
    }
    expect(new Set(pts.map((p) => p.source))).toEqual(new Set([0, 1]));
  });
  it('mulberry32 is deterministic in [0,1)', () => {
    const r = mulberry32(3), s = mulberry32(3);
    for (let i = 0; i < 20; i++) {
      const v = r();
      expect(v).toBe(s());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
