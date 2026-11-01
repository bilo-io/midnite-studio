// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { applyGuidance, createGaussian, mulberry32, pingPongSchedule, samplePingPong } from './sampler';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

describe('pingPongSchedule', () => {
  it('runs from exactly 1 to exactly 0 through sigmoid(8.2u − 2) — the reference 8-step schedule', () => {
    const t = pingPongSchedule(8);
    expect(t.length).toBe(9);
    expect(t[0]).toBe(1);
    expect(t[8]).toBe(0);
    for (let i = 1; i < 8; i += 1) expect(t[i]).toBeCloseTo(sigmoid(8.2 * (1 - i / 8) - 2), 12);
    // spot values: u = 7/8, 4/8, 1/8
    expect(t[1]).toBeCloseTo(0.99438, 4);
    expect(t[4]).toBeCloseTo(0.8909, 4);
    expect(t[7]).toBeCloseTo(0.27389, 4);
  });

  it('is strictly decreasing for any step count', () => {
    for (const steps of [1, 2, 8, 16, 32]) {
      const t = pingPongSchedule(steps);
      for (let i = 1; i < t.length; i += 1) expect(t[i]!).toBeLessThan(t[i - 1]!);
    }
  });

  it('rejects a non-positive or fractional step count', () => {
    expect(() => pingPongSchedule(0)).toThrow();
    expect(() => pingPongSchedule(2.5)).toThrow();
  });
});

describe('seeded noise', () => {
  it('is reproducible per seed and differs between seeds', () => {
    const a = createGaussian(42)(new Float32Array(8));
    const b = createGaussian(42)(new Float32Array(8));
    const c = createGaussian(43)(new Float32Array(8));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('mulberry32 stays in [0, 1)', () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is standard normal (mean ≈ 0, variance ≈ 1)', () => {
    const x = createGaussian(1)(new Float32Array(200_000));
    let sum = 0;
    let sq = 0;
    for (const v of x) {
      sum += v;
      sq += v * v;
    }
    const mean = sum / x.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(sq / x.length - mean * mean - 1)).toBeLessThan(0.02);
  });
});

describe('applyGuidance', () => {
  it('is uncond + (cond − uncond)·scale, and the identity at scale 1', () => {
    const cond = Float32Array.of(1, 2, 3);
    const uncond = Float32Array.of(0, 1, 5);
    expect(Array.from(applyGuidance(cond, uncond, 1))).toEqual([1, 2, 3]);
    expect(Array.from(applyGuidance(cond, uncond, 3))).toEqual([3, 4, -1]);
  });
});

describe('samplePingPong', () => {
  const ones = (n: number) => new Float32Array(n).fill(1);

  it('returns the exact clean signal when the model predicts the true velocity', async () => {
    // Rectified flow: x_t = (1 − t)·x0 + t·ε, so v = ε − x0 and x − t·v = x0 whatever t is.
    const x0 = Float32Array.of(0.5, -0.25, 2);
    const eps = Float32Array.of(1, -1, 0.5);
    const out = await samplePingPong({
      initial: eps,
      schedule: pingPongSchedule(8),
      velocity: async () => Float32Array.from(eps, (e, i) => e - x0[i]!),
      noise: (buf) => {
        buf.set(eps);
        return buf;
      },
      onStep: () => undefined,
    });
    for (let i = 0; i < 3; i += 1) expect(out[i]).toBeCloseTo(x0[i]!, 6);
  });

  it('applies den = x − t·v then x′ = (1 − t′)·den + t′·ε each step', async () => {
    const schedule = Float64Array.of(1, 0.5, 0);
    const seen: Array<[number[], number]> = [];
    const out = await samplePingPong({
      initial: Float32Array.of(2),
      schedule,
      velocity: async (x, t) => {
        seen.push([Array.from(x), t]);
        return ones(1);
      },
      noise: (buf) => buf.fill(10),
    });
    // step 0: den = 2 − 1·1 = 1; x = 0.5·1 + 0.5·10 = 5.5. step 1: den = 5.5 − 0.5·1 = 5 (t′ = 0: no noise).
    expect(seen).toEqual([
      [[2], 1],
      [[5.5], 0.5],
    ]);
    expect(Array.from(out)).toEqual([5]);
  });

  it('reports every step and leaves the initial noise untouched', async () => {
    const initial = Float32Array.of(1, 1);
    const steps: number[] = [];
    await samplePingPong({ initial, schedule: pingPongSchedule(4), velocity: async () => ones(2), noise: (b) => b.fill(0), onStep: (d) => steps.push(d) });
    expect(steps).toEqual([1, 2, 3, 4]);
    expect(Array.from(initial)).toEqual([1, 1]);
  });

  it('stops between steps once cancelled', async () => {
    let calls = 0;
    await expect(
      samplePingPong({
        initial: ones(1),
        schedule: pingPongSchedule(8),
        velocity: async () => {
          calls += 1;
          return ones(1);
        },
        noise: (b) => b,
        isCancelled: () => calls >= 2,
      }),
    ).rejects.toThrow('cancelled');
    expect(calls).toBe(2);
  });

  it('refuses a velocity of the wrong size', async () => {
    await expect(samplePingPong({ initial: ones(2), schedule: pingPongSchedule(1), velocity: async () => ones(3), noise: (b) => b })).rejects.toThrow(/3 values/);
  });
});
