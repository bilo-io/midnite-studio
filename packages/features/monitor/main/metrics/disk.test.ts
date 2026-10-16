import { describe, expect, it } from 'vitest';

import { diskFromDf, diskFromStatfs, parseDf } from './disk';

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

/**
 * Captured `df -k /System/Volumes/Data` from a real machine mid-bug: `statfs`
 * on this same volume computed ~376 GB used because its `f_bfree` is shared
 * across the System/Data split, while both `df` and Finder agreed on ~345 GB.
 */
const DF_OUTPUT = [
  'Filesystem    1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on',
  '/dev/disk3s5    482797652 344580476 115570752    75% 6446509 1155707520    1%   /System/Volumes/Data',
].join('\n');

describe('parseDf', () => {
  it("parses df's data row into total / used / available, in 1024-byte blocks", () => {
    expect(parseDf(DF_OUTPUT)).toEqual({
      totalKb: 482797652,
      usedKb: 344580476,
      availableKb: 115570752,
    });
  });

  it('anchors on the trailing "NN%" rather than fixed columns, so a wrapped Filesystem field does not shift it', () => {
    const wrapped = [
      'Filesystem',
      '/dev/disk3s5    482797652 344580476 115570752    75% 6446509 1155707520    1%   /System/Volumes/Data',
    ].join('\n');
    expect(parseDf(wrapped)).toEqual({ totalKb: 482797652, usedKb: 344580476, availableKb: 115570752 });
  });

  it('is undefined on df error output rather than a garbage row', () => {
    expect(parseDf('df: /nonexistent: No such file or directory\n')).toBeUndefined();
    expect(parseDf('')).toBeUndefined();
  });
});

describe('diskFromDf', () => {
  it("reports df's own used/total, not statfs's container-wide figures", () => {
    const reading = diskFromDf(parseDf(DF_OUTPUT)!)!;
    expect(reading.used).toBe(344580476 * 1024);
    expect(reading.total).toBe(482797652 * 1024);
    expect(reading.percent).toBeCloseTo(71.4, 1);
  });

  it('is undefined on a nonsense total rather than dividing by zero', () => {
    expect(diskFromDf({ totalKb: 0, usedKb: 0, availableKb: 0 })).toBeUndefined();
  });
});
