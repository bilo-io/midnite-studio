import { describe, expect, it } from 'vitest';

import { dayAfter, dayBefore, fiscalYearStart } from './ledger-math';

describe('ledger math', () => {
  it('finds the fiscal year start on or before a date', () => {
    expect(fiscalYearStart({ month: 4, day: 6 }, '2026-05-20')).toBe('2026-04-06');
    expect(fiscalYearStart({ month: 4, day: 6 }, '2026-03-01')).toBe('2025-04-06');
    expect(fiscalYearStart({ month: 1, day: 1 }, '2026-01-01')).toBe('2026-01-01');
    expect(fiscalYearStart({ month: 2, day: 31 }, '2026-03-01')).toBe('2026-02-28');
  });
  it('steps a day either way across month ends', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayAfter('2025-12-31')).toBe('2026-01-01');
  });
});
