import { describe, expect, it } from 'vitest';

import { buildHeightfield, gaussianBlur, heightfieldNormals, heightfieldStats, resampleBicubic, type Heightfield } from './heightfield';
import { toHeightSamples } from './raster';

const field = (res: number, worldSize: number, f: (x: number, z: number) => number): Heightfield => {
  const heights = new Float32Array(res * res);
  const cell = worldSize / (res - 1);
  for (let z = 0; z < res; z += 1) for (let x = 0; x < res; x += 1) heights[z * res + x] = f(x * cell, z * cell);
  return { resolution: res, worldSize, heights };
};

describe('resampleBicubic', () => {
  it('returns the source exactly when sizes match', () => {
    const src = Float32Array.from({ length: 25 }, (_, i) => Math.sin(i));
    expect(Array.from(resampleBicubic(src, 5, 5, 5))).toEqual(Array.from(src));
  });

  it('is exact on grid points when upsampling by an integer factor', () => {
    const src = Float32Array.from({ length: 9 }, (_, i) => (i * 7) % 5);
    const out = resampleBicubic(src, 3, 3, 5); // every second output vertex is a source sample
    for (let z = 0; z < 3; z += 1) for (let x = 0; x < 3; x += 1) expect(out[z * 2 * 5 + x * 2]).toBeCloseTo(src[z * 3 + x]!, 6);
  });

  it('reproduces a linear ramp', () => {
    const src = Float32Array.from({ length: 16 }, (_, i) => (i % 4) / 3);
    const out = resampleBicubic(src, 4, 4, 9);
    // Interior only: the outermost taps clamp, which bends the ramp at the edges.
    for (let x = 3; x <= 5; x += 1) expect(out[x]).toBeCloseTo(x / 8, 5);
  });

  it('stretches a non-square source to a square grid', () => {
    const out = resampleBicubic(new Float32Array(6).fill(0.5), 3, 2, 5);
    expect(out).toHaveLength(25);
    expect(out[12]).toBeCloseTo(0.5, 6);
  });
});

describe('buildHeightfield', () => {
  it('maps samples into the height range', () => {
    const f = buildHeightfield(new Float32Array([0, 1, 0, 1]), 2, 2, { resolution: 129, worldSize: 100, heightRange: [10, 110] });
    const { min, max } = heightfieldStats(f);
    expect(min).toBeGreaterThanOrEqual(10);
    expect(max).toBeLessThanOrEqual(110);
    expect(f.heights[0]).toBeCloseTo(10, 4);
    expect(f.heights[128]).toBeCloseTo(110, 4);
  });

  it('pre-smooths the source before resampling', () => {
    const spike = new Float32Array(81);
    spike[40] = 1;
    const sharp = buildHeightfield(spike, 9, 9, { resolution: 129, worldSize: 100, heightRange: [0, 1] });
    const soft = buildHeightfield(spike, 9, 9, { resolution: 129, worldSize: 100, heightRange: [0, 1], preSmooth: 2 });
    expect(heightfieldStats(soft).max).toBeLessThan(heightfieldStats(sharp).max);
  });
});

describe('gaussianBlur', () => {
  it('preserves a constant field and the total of an interior impulse', () => {
    expect(Array.from(gaussianBlur(new Float32Array(25).fill(0.3), 5, 1)).every((v) => Math.abs(v - 0.3) < 1e-6)).toBe(true);
    const impulse = new Float32Array(121);
    impulse[60] = 1;
    const out = gaussianBlur(impulse, 11, 1);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });
});

describe('heightfieldNormals', () => {
  it('points along normalize([-2, 1, 0]) on the plane y = 2x', () => {
    const f = field(9, 8, (x) => 2 * x);
    const n = heightfieldNormals(f);
    const expected = [-2 / Math.hypot(2, 1), 1 / Math.hypot(2, 1), 0];
    for (let v = 0; v < 81; v += 1) for (let k = 0; k < 3; k += 1) expect(Math.abs(n[v * 3 + k]! - expected[k]!)).toBeLessThan(1e-6);
  });

  it('points away from the apex of a cone', () => {
    const res = 33;
    const f = field(res, 32, (x, z) => 10 - Math.hypot(x - 16, z - 16));
    const n = heightfieldNormals(f);
    const at = (x: number, z: number) => [n[(z * res + x) * 3]!, n[(z * res + x) * 3 + 1]!, n[(z * res + x) * 3 + 2]!];
    expect(at(24, 16)[0]!).toBeGreaterThan(0);
    expect(at(8, 16)[0]!).toBeLessThan(0);
    expect(at(16, 24)[2]!).toBeGreaterThan(0);
    expect(at(16, 8)[2]!).toBeLessThan(0);
    for (const v of [at(24, 16), at(3, 7)]) expect(Math.hypot(v[0]!, v[1]!, v[2]!)).toBeCloseTo(1, 6);
  });
});

describe('heightfieldStats', () => {
  it('has a histogram that sums to resolution^2', () => {
    const f = field(17, 16, (x, z) => x * 3 + z);
    const stats = heightfieldStats(f);
    expect(stats.histogram).toHaveLength(16);
    expect(stats.histogram.reduce((a, b) => a + b, 0)).toBe(17 * 17);
    expect(stats.min).toBe(0);
    expect(stats.max).toBeCloseTo(64, 3);
  });
});

describe('toHeightSamples', () => {
  it('uses grey as-is and warns on 8-bit', () => {
    const out = toHeightSamples({ width: 2, height: 1, channels: 1, bitDepth: 8, data: new Uint8Array([0, 255]) });
    expect(Array.from(out.samples)).toEqual([0, 1]);
    expect(out.warnings[0]).toMatch(/terracing/);
  });
  it('reduces RGB to Rec. 709 luminance', () => {
    const out = toHeightSamples({ width: 1, height: 1, channels: 3, bitDepth: 8, data: new Uint8Array([255, 0, 0]) });
    expect(out.samples[0]).toBeCloseTo(0.2126, 5);
  });
  it('keeps 16-bit precision and does not warn', () => {
    const out = toHeightSamples({ width: 2, height: 1, channels: 1, bitDepth: 16, data: new Uint16Array([1, 65535]) });
    expect(out.samples[0]).toBeCloseTo(1 / 65535, 8);
    expect(out.warnings).toEqual([]);
  });
});
