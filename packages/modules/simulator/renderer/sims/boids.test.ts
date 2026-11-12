import { describe, expect, it } from 'vitest';

import { BOIDS_DEFAULTS, createBoids, type BoidsParams } from './boids';

const run = (p: BoidsParams, seed: number, ticks: number) => {
  const e = createBoids();
  e.init(p, seed);
  for (let i = 0; i < ticks; i++) e.step();
  const out = new Float32Array(e.capacity);
  e.snapshot(out);
  return { e, out };
};

describe('boids', () => {
  it('replays identically from the same seed and differs for another', () => {
    const p = { ...BOIDS_DEFAULTS, count: 150 };
    expect([...run(p, 3, 100).out]).toEqual([...run(p, 3, 100).out]);
    expect([...run(p, 4, 100).out]).not.toEqual([...run(p, 3, 100).out]);
  });

  it('aligns with alignment alone (polarisation grows)', () => {
    // A small box so each boid has several neighbours within the radius.
    const p: BoidsParams = { ...BOIDS_DEFAULTS, count: 200, box: 30, alignment: 2, separation: 0, cohesion: 0 };
    const before = createBoids();
    before.init(p, 11);
    const after = run(p, 11, 600).e.stats().polarisation!;
    expect(after).toBeGreaterThan(before.stats().polarisation!);
  });

  it('stays inside the box and keeps its speed band', () => {
    const p = { ...BOIDS_DEFAULTS, count: 200, box: 40 };
    const { out } = run(p, 5, 300);
    for (let i = 0; i < 200; i++) {
      for (let k = 0; k < 3; k++) {
        expect(out[6 * i + k]!).toBeGreaterThanOrEqual(0);
        expect(out[6 * i + k]!).toBeLessThanOrEqual(40);
      }
      const sp = Math.hypot(out[6 * i + 3]!, out[6 * i + 4]!, out[6 * i + 5]!);
      expect(sp).toBeLessThanOrEqual(p.maxSpeed + 1e-4);
      expect(sp).toBeGreaterThanOrEqual(p.maxSpeed * 0.5 - 1e-4);
    }
  });

  it('round-trips state and rejects an out-of-range count', () => {
    const p = { ...BOIDS_DEFAULTS, count: 50 };
    const a = run(p, 2, 20).e;
    const b = createBoids();
    b.init(p, 2);
    b.restore(a.serialise());
    a.step();
    b.step();
    const oa = new Float32Array(a.capacity);
    const ob = new Float32Array(b.capacity);
    a.snapshot(oa);
    b.snapshot(ob);
    expect([...ob]).toEqual([...oa]);
    expect(() => createBoids().init({ ...p, count: 9 }, 1)).toThrow('count');
    expect(() => createBoids().init({ ...p, count: 2001 }, 1)).toThrow('count');
  });
});
