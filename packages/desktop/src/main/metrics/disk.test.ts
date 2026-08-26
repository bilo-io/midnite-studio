import { describe, expect, it } from 'vitest';

import { diskFromStatfs } from './disk';

describe('diskFromStatfs', () => {
  it("computes df's capacity: used / (used + available)", () => {
    // 1000 blocks total, 300 free to root, 200 available unprivileged.
    // used = 700, available = 200 → 700/900 ≈ 77.8%
    const reading = diskFromStatfs({ bsize: 4096, blocks: 1000, bfree: 300, bavail: 200 })!;
    expect(reading.percent).toBeCloseTo(77.8, 1);
    expect(reading.used).toBe(700 * 4096);
  });

  it('denominates against used + available, so the gauge agrees with its own label', () => {
    // NOT blocks * bsize: the root reserve (bfree - bavail) belongs to neither
    // term, and using the raw volume size would draw a gauge that disagrees
    // with the percentage printed beside it.
    const reading = diskFromStatfs({ bsize: 4096, blocks: 1000, bfree: 300, bavail: 200 })!;
    expect(reading.total).toBe(900 * 4096);
    expect(reading.total).not.toBe(1000 * 4096);
    // To 3dp: the percentage is rounded to one decimal place on the way out,
    // so exact equality is not the claim — agreement within that rounding is.
    expect(reading.used / reading.total).toBeCloseTo(reading.percent / 100, 3);
  });

  it('uses bavail rather than bfree for the space a normal process can have', () => {
    const generous = diskFromStatfs({ bsize: 512, blocks: 100, bfree: 50, bavail: 50 })!;
    const reserved = diskFromStatfs({ bsize: 512, blocks: 100, bfree: 50, bavail: 10 })!;
    // Same used figure, but a smaller unprivileged remainder reads as fuller.
    expect(reserved.used).toBe(generous.used);
    expect(reserved.percent).toBeGreaterThan(generous.percent);
  });

  it('reports a full volume as 100 rather than dividing by zero', () => {
    expect(diskFromStatfs({ bsize: 4096, blocks: 1000, bfree: 0, bavail: 0 })?.percent).toBe(100);
  });

  it('is undefined on a nonsense filesystem rather than emitting NaN', () => {
    expect(diskFromStatfs({ bsize: 0, blocks: 1000, bfree: 0, bavail: 0 })).toBeUndefined();
    expect(diskFromStatfs({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 })).toBeUndefined();
  });
});
