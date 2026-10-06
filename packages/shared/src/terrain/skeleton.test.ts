import { describe, expect, it } from 'vitest';

import { neighbourCount, removeStaircases, zhangSuen } from './skeleton';
import { paintedMask } from './road-test-fixtures';

const count = (m: Uint8Array): number => m.reduce((s, v) => s + v, 0);

describe('zhangSuen', () => {
  it('thins a 10 px bar to a one-pixel line', () => {
    const size = 64;
    const skel = removeStaircases(zhangSuen(paintedMask(size, (x, y) => x >= 4 && x < 60 && y >= 27 && y < 37), size, size), size, size);
    // One pixel per column along most of the bar.
    for (let x = 12; x < 52; x += 1) {
      let column = 0;
      for (let y = 0; y < size; y += 1) column += skel[y * size + x]!;
      expect(column).toBe(1);
    }
  });

  it('leaves every interior centreline pixel with exactly two neighbours after staircase removal', () => {
    const size = 64;
    const diagonal = paintedMask(size, (x, y) => Math.abs(x - y) <= 3 && x > 4 && x < 59);
    const skel = removeStaircases(zhangSuen(diagonal, size, size), size, size);
    expect(count(skel)).toBeGreaterThan(30);
    let ends = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!skel[y * size + x]) continue;
        const n = neighbourCount(skel, size, size, x, y);
        if (n === 1) ends += 1;
        else expect(n).toBe(2);
      }
    }
    expect(ends).toBe(2);
  });

  it('returns an empty skeleton for an empty mask', () => {
    expect(count(zhangSuen(new Uint8Array(100), 10, 10))).toBe(0);
  });
});
