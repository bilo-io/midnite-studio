import { describe, expect, it } from 'vitest';

import { freememFallback, memoryUsedBytes, parseVmStat } from './memory';

/**
 * Captured `vm_stat` output from an Apple Silicon machine — **16384-byte
 * pages**, which is the whole reason the page size is parsed rather than
 * assumed. A hardcoded 4096 would under-report every figure below by 4×.
 */
const APPLE_SILICON = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                9217.
Pages active:                            458752.
Pages inactive:                          451182.
Pages speculative:                        14006.
Pages throttled:                              0.
Pages wired down:                        131072.
Pages purgeable:                          16384.
"Translation faults":                 984516212.
Pages copy-on-write:                   38102847.
Pages zero filled:                    502938471.
Pages reactivated:                      1029384.
Pages purged:                           8273645.
File-backed pages:                       262144.
Anonymous pages:                         655360.
Pages stored in compressor:              196608.
Pages occupied by compressor:             65536.
Decompressions:                         2938471.
Compressions:                           4827361.
Pageins:                               10293847.
Pageouts:                                  8273.
Swapins:                                      0.
Swapouts:                                     0.
`;

/** The same command on an Intel mac: 4096-byte pages, same field names. */
const INTEL = `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                              102400.
Pages active:                           1048576.
Pages wired down:                        524288.
Pages purgeable:                          65536.
Anonymous pages:                        1572864.
Pages occupied by compressor:            262144.
`;

describe('parseVmStat', () => {
  it('reads the page size from the header rather than assuming 4096', () => {
    expect(parseVmStat(APPLE_SILICON)?.pageSize).toBe(16384);
    expect(parseVmStat(INTEL)?.pageSize).toBe(4096);
  });

  it('picks up the four fields the Activity Monitor formula needs', () => {
    expect(parseVmStat(APPLE_SILICON)).toMatchObject({
      anonymous: 655360,
      purgeable: 16384,
      wired: 131072,
      compressed: 65536,
    });
  });

  it('does not confuse "Pages stored in compressor" with "Pages occupied by compressor"', () => {
    // The two differ by the compression ratio and sit adjacent in the output.
    // "occupied" is the physical footprint and the one the formula wants.
    expect(parseVmStat(APPLE_SILICON)?.compressed).toBe(65536);
  });

  it('returns null when there is no page-size header to anchor on', () => {
    expect(parseVmStat('Pages free: 100.\n')).toBeNull();
    expect(parseVmStat('')).toBeNull();
    expect(parseVmStat('vm_stat: command not found')).toBeNull();
  });

  it('leaves a field it cannot find undefined rather than defaulting it to zero', () => {
    const stat = parseVmStat('Mach Virtual Memory Statistics: (page size of 4096 bytes)\n');
    expect(stat?.anonymous).toBeUndefined();
    expect(stat?.wired).toBeUndefined();
  });
});

describe('memoryUsedBytes', () => {
  it('computes max(anonymous - purgeable, 0) + wired + compressed, in bytes', () => {
    const stat = parseVmStat(APPLE_SILICON)!;
    // (655360 - 16384) + 131072 + 65536 = 835584 pages
    expect(memoryUsedBytes(stat)).toBe(835584 * 16384);
  });

  it('never lets purgeable exceeding anonymous produce a negative term', () => {
    expect(
      memoryUsedBytes({ pageSize: 4096, anonymous: 100, purgeable: 500, wired: 10, compressed: 5 }),
    ).toBe(15 * 4096);
  });

  it('treats an absent purgeable count as zero, over-reporting rather than guessing', () => {
    expect(memoryUsedBytes({ pageSize: 4096, anonymous: 100, wired: 10, compressed: 5 })).toBe(
      115 * 4096,
    );
  });

  it('returns undefined when a load-bearing field is missing, rather than a partial sum', () => {
    expect(memoryUsedBytes({ pageSize: 4096, wired: 10, compressed: 5 })).toBeUndefined();
    expect(memoryUsedBytes({ pageSize: 4096, anonymous: 100, compressed: 5 })).toBeUndefined();
    expect(memoryUsedBytes({ pageSize: 4096, anonymous: 100, wired: 10 })).toBeUndefined();
  });
});

describe('freememFallback', () => {
  it('reports used-of-total as a percentage', () => {
    expect(freememFallback(1000, 250)).toEqual({ percent: 75, used: 750, total: 1000 });
  });

  it('is undefined on a nonsense total rather than dividing by zero', () => {
    expect(freememFallback(0, 0)).toBeUndefined();
  });
});
