import { describe, expect, it } from 'vitest';

import { localDateKey, monthKeyOffset, monthOf } from './dates';

describe('dates', () => {
  it('files a late-evening local time under that local day', () => {
    // Under TZ=Africa/Johannesburg (UTC+2) toISOString() would say 2026-11-11T21:30Z; the local date is still the 11th.
    expect(localDateKey(new Date(2026, 10, 11, 23, 30))).toBe('2026-11-11');
    expect(localDateKey(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });

  it('slices a month and offsets across a year boundary', () => {
    expect(monthOf('2026-11-11')).toBe('2026-11');
    expect(monthKeyOffset(new Date(2026, 0, 15), -1)).toBe('2025-12');
    expect(monthKeyOffset(new Date(2026, 10, 30), -12)).toBe('2025-11');
  });
});
