import { describe, expect, it } from 'vitest';

import { createRng, fbmField, ridgedField } from './noise';

const params = { seed: 7, octaves: 5, frequency: 2, persistence: 0.5, lacunarity: 2 };
const bytes = (f: Float32Array) => Buffer.from(f.buffer, f.byteOffset, f.byteLength);

describe('noise', () => {
  it('the same seed gives a byte-identical field, another seed a different one', () => {
    expect(bytes(fbmField(33, params)).equals(bytes(fbmField(33, params)))).toBe(true);
    expect(bytes(fbmField(33, params)).equals(bytes(fbmField(33, { ...params, seed: 8 })))).toBe(false);
    expect(bytes(ridgedField(33, params)).equals(bytes(ridgedField(33, params)))).toBe(true);
  });

  it('is normalised to [0, 1] and spans it', () => {
    for (const field of [fbmField(65, params), ridgedField(65, params)]) {
      expect(Math.min(...field)).toBeCloseTo(0, 5);
      expect(Math.max(...field)).toBeCloseTo(1, 5);
    }
  });

  it('the island falloff pulls the corners to zero and leaves the centre alone', () => {
    const island = fbmField(65, { ...params, island: true });
    const plain = fbmField(65, params);
    expect(island[0]).toBe(0);
    expect(island[65 * 65 - 1]).toBe(0);
    expect(island[32 * 65 + 32]).toBe(plain[32 * 65 + 32]);
  });

  it('createRng is deterministic and in [0, 1)', () => {
    const a = createRng(3);
    const b = createRng(3);
    for (let i = 0; i < 100; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
