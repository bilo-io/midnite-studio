import { describe, expect, it } from 'vitest';

import { EROSION_MAX_ITERATIONS, erode } from './erosion';
import { fbmField } from './noise';

const field = () => fbmField(129, { seed: 3, octaves: 6, frequency: 3, persistence: 0.5, lacunarity: 2 });
const bytes = (f: Float32Array) => Buffer.from(f.buffer, f.byteOffset, f.byteLength);

describe('erode', () => {
  it('conserves sediment mass within 1 %', () => {
    const result = erode(field(), 129, { iterations: 10_000, seed: 1 });
    expect(result.eroded).toBeGreaterThan(0);
    expect(Math.abs(result.eroded - result.deposited) / result.eroded).toBeLessThan(0.01);
  });

  it('changes the field, and is deterministic', () => {
    const a = erode(field(), 129, { iterations: 2_000, seed: 1 });
    const b = erode(field(), 129, { iterations: 2_000, seed: 1 });
    expect(bytes(a.heights).equals(bytes(b.heights))).toBe(true);
    expect(bytes(a.heights).equals(bytes(field()))).toBe(false);
  });

  it('clamps iterations to 500 000', () => {
    expect(EROSION_MAX_ITERATIONS).toBe(500_000);
    let last = 0;
    // A flat tiny grid ends every droplet at once, so the clamped run is quick; progress reaching 1 proves it terminated.
    const small = new Float32Array(9 * 9).fill(0.5);
    const result = erode(small, 9, { iterations: 1_000_000, seed: 1 }, (f) => (last = f));
    expect(last).toBe(1);
    expect(result.heights.length).toBe(81);
  });

  it('reports progress in 5 % steps', () => {
    const seen: number[] = [];
    erode(field(), 129, { iterations: 2_000, seed: 1 }, (f) => seen.push(f));
    expect(seen.length).toBeGreaterThanOrEqual(19);
    expect(seen.at(-1)).toBe(1);
  });
});
