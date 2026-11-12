import { describe, expect, it } from 'vitest';

import { dayAfter, dayBefore, fiscalYearStart, presetRange } from './ledger-math';

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
  it('resolves each range preset on a date', () => {
    const uk = { month: 4, day: 6 };
    expect(presetRange('month', '2026-05-20', uk)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
    expect(presetRange('last-month', '2026-01-10', uk)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('quarter', '2026-05-20', uk)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(presetRange('fiscal-year', '2026-05-20', uk)).toEqual({ from: '2026-04-06', to: '2026-05-20' });
    expect(presetRange('last-fiscal-year', '2026-05-20', uk)).toEqual({ from: '2025-04-06', to: '2026-04-05' });
    expect(presetRange('last-fiscal-year', '2026-03-01', uk)).toEqual({ from: '2024-04-06', to: '2025-04-05' });
    expect(presetRange('custom', '2026-05-20', uk)).toBeNull();
  });
});
