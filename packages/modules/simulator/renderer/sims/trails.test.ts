import { describe, expect, it } from 'vitest';

import { createTrails } from './trails';

describe('trails', () => {
  it('keeps the last `length` points, oldest first', () => {
    const t = createTrails(1, 3);
    for (let x = 1; x <= 5; x++) t.push(new Float32Array([x, 0, 0]));
    const out = new Float32Array(9);
    expect(t.write(0, out)).toBe(3);
    expect([out[0], out[3], out[6]]).toEqual([3, 4, 5]);
  });

  it('keeps bodies separate and clears', () => {
    const t = createTrails(2, 4);
    t.push(new Float32Array([1, 2, 3, 4, 5, 6]));
    const out = new Float32Array(12);
    t.write(1, out);
    expect([...out.slice(0, 3)]).toEqual([4, 5, 6]);
    t.clear();
    expect(t.write(0, out)).toBe(0);
  });
});
