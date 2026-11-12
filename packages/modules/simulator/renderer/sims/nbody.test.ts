import { describe, expect, it } from 'vitest';

import { createNBody, MAX_BODIES, type Body } from './nbody';
import { NBODY_PRESETS } from './nbody-presets';

const b = (name: string, mass: number, x: number, vy: number): Body => ({ name, mass, x, y: 0, z: 0, vx: 0, vy, vz: 0, color: '#fff', radius: 0.1 });

describe('nbody', () => {
  it('returns a circular two-body orbit to its start after one period', () => {
    const e = createNBody();
    // A light body orbits a heavy one: G = 1, M = 1, r = 1, v = 1, period 2 pi.
    e.init({ bodies: [b('M', 1, 0, 0), b('m', 1e-6, 1, 1)], G: 1, dt: 0.001, softening: 0 }, 0);
    const steps = Math.round((2 * Math.PI) / 0.001);
    for (let i = 0; i < steps; i++) e.step();
    const out = new Float32Array(e.capacity);
    e.snapshot(out);
    expect(Math.hypot(out[3]! - 1, out[4]!)).toBeLessThan(1e-3);
  });

  it('keeps the energy drift under 1e-6 over 10 periods', () => {
    const e = createNBody();
    e.init({ bodies: [b('M', 1, 0, 0), b('m', 1e-6, 1, 1)], G: 1, dt: 0.001, softening: 0 }, 0);
    for (let i = 0; i < Math.round((20 * Math.PI) / 0.001); i++) e.step();
    expect(e.stats().energyDrift!).toBeLessThan(1e-6);
  });

  it('keeps the figure-eight bounded for one period', () => {
    const e = createNBody();
    e.init(NBODY_PRESETS.find((x) => x.id === 'figure-eight')!.params(), 0);
    const out = new Float32Array(e.capacity);
    for (let i = 0; i < 6326; i++) {
      e.step();
      e.snapshot(out);
      for (const v of out) expect(Math.abs(v)).toBeLessThan(2);
    }
  });

  it.each(NBODY_PRESETS.map((p) => [p.label, p] as const))('%s starts with zero net momentum', (_, preset) => {
    const { bodies } = preset.params();
    for (const k of ['vx', 'vy', 'vz'] as const) {
      expect(Math.abs(bodies.reduce((s, x) => s + x.mass * x[k], 0))).toBeLessThan(1e-9);
    }
  });

  it('round-trips its state and keeps stepping identically', () => {
    const p = NBODY_PRESETS[0]!.params();
    const a = createNBody();
    a.init(p, 1);
    for (let i = 0; i < 50; i++) a.step();
    const c = createNBody();
    c.init(p, 1);
    c.restore(a.serialise());
    a.step();
    c.step();
    const oa = new Float32Array(a.capacity);
    const oc = new Float32Array(c.capacity);
    a.snapshot(oa);
    c.snapshot(oc);
    expect([...oc]).toEqual([...oa]);
  });

  it('refuses a non-positive dt and more than the body limit', () => {
    const e = createNBody();
    expect(() => e.init({ bodies: [], G: 1, dt: 0, softening: 0 }, 0)).toThrow('dt');
    expect(() => e.init({ bodies: Array.from({ length: MAX_BODIES + 1 }, () => b('x', 1, 0, 0)), G: 1, dt: 1, softening: 0 }, 0)).toThrow('limit');
  });
});
