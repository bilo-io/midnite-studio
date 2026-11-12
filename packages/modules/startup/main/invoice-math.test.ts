import { describe, expect, it } from 'vitest';

import { lineNet, totals } from './invoice-math';

describe('invoice math', () => {
  it('1.5 h at £80.00 and 20 % is net 12000, tax 2400', () => {
    const t = totals({ lines: [{ description: 'Consulting', quantityMilli: 1500, unitMinor: 8000, taxRateBp: 2000 }] });
    expect(t).toMatchObject({ netMinor: 12000, taxMinor: 2400, totalMinor: 14400 });
  });
  it('has no float drift: 3 × 3.33 is 999, and a third of a penny rounds half away from zero', () => {
    expect(lineNet({ quantityMilli: 3000, unitMinor: 333 })).toBe(999);
    expect(lineNet({ quantityMilli: 1, unitMinor: 500 })).toBe(1); // 0.5 rounds up
    expect(lineNet({ quantityMilli: 1, unitMinor: 499 })).toBe(0);
    expect(lineNet({ quantityMilli: 1_000_000, unitMinor: 9_007_199_254 })).toBe(9_007_199_254_000);
  });
  it('rounds half away from zero for negative quantities and credit lines too', () => {
    expect(lineNet({ quantityMilli: -1, unitMinor: 500 })).toBe(-1); // -0.5 rounds to -1, not 0
    expect(lineNet({ quantityMilli: 1, unitMinor: -500 })).toBe(-1);
    expect(lineNet({ quantityMilli: -1, unitMinor: 499 })).toBe(0);
    expect(lineNet({ quantityMilli: -1500, unitMinor: 8000 })).toBe(-12000);
    expect(lineNet({ quantityMilli: -1, unitMinor: -500 })).toBe(1);
  });
  it('groups tax by rate', () => {
    const t = totals({
      lines: [
        { description: 'A', quantityMilli: 1000, unitMinor: 10000, taxRateBp: 2000 },
        { description: 'B', quantityMilli: 1000, unitMinor: 5000, taxRateBp: 500 },
        { description: 'C', quantityMilli: 2000, unitMinor: 5000, taxRateBp: 2000 },
      ],
    });
    expect(t.taxByRate.get(2000)).toBe(4000);
    expect(t.taxByRate.get(500)).toBe(250);
    expect(t.taxMinor).toBe(4250);
  });
});
