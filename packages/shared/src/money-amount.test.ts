import { describe, expect, it } from 'vitest';
import {
  CURRENCY_MINOR_UNITS,
  MoneyAmountSchema,
  allocateMinor,
  formatAmount,
  minorUnitsOf,
  parseAmount,
  percentOfMinor,
} from './money-amount';

describe('parseAmount', () => {
  it('parses thousands separators', () => {
    expect(parseAmount('1,234.56', 'USD')).toEqual({ ok: true, minor: 123456 });
  });
  it('sums 0.1 + 0.2 exactly', () => {
    const a = parseAmount('0.1', 'USD');
    const b = parseAmount('0.2', 'USD');
    expect(a.ok && b.ok && a.minor + b.minor).toBe(30);
  });
  it('rejects too many decimals', () => {
    expect(parseAmount('1.234', 'USD')).toEqual({ ok: false, reason: 'too-many-decimals' });
  });
  it('honours zero- and three-decimal currencies', () => {
    expect(parseAmount('1234', 'JPY')).toEqual({ ok: true, minor: 1234 });
    expect(parseAmount('1.5', 'JPY')).toEqual({ ok: false, reason: 'too-many-decimals' });
    expect(parseAmount('1.234', 'KWD')).toEqual({ ok: true, minor: 1234 });
  });
  it('handles sign, whitespace and empties', () => {
    expect(parseAmount('  -12.5 ', 'USD')).toEqual({ ok: true, minor: -1250 });
    expect(parseAmount('-0', 'USD')).toEqual({ ok: true, minor: 0 });
    expect(parseAmount('   ', 'USD')).toEqual({ ok: false, reason: 'empty' });
    expect(parseAmount('abc', 'USD')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseAmount('1.2.3', 'USD')).toEqual({ ok: false, reason: 'not-a-number' });
  });
  it('rejects amounts beyond 2^53', () => {
    expect(parseAmount('99999999999999999.99', 'USD')).toEqual({ ok: false, reason: 'too-large' });
  });
});

describe('percentOfMinor', () => {
  it('rounds half away from zero', () => {
    expect(percentOfMinor(-125, 2000)).toBe(-25);
    expect(percentOfMinor(1, 5000)).toBe(1);
    expect(percentOfMinor(-1, 5000)).toBe(-1);
    expect(percentOfMinor(100, 2000)).toBe(20);
  });
});

describe('allocateMinor', () => {
  it('splits by largest remainder', () => {
    expect(allocateMinor(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
  it('always sums exactly', () => {
    for (const minor of [0, 1, 7, 999, -101]) {
      const parts = allocateMinor(minor, [3, 5, 11]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(minor);
    }
  });
});

describe('formatAmount / currency units', () => {
  it('formats GBP', () => {
    expect(formatAmount({ minor: 123456, currency: 'GBP' }, 'en-GB')).toBe('£1,234.56');
  });
  it('formats zero-decimal currency', () => {
    expect(formatAmount({ minor: 1234, currency: 'JPY' }, 'en-US')).toBe('¥1,234');
  });
  it('knows minor units', () => {
    expect(minorUnitsOf('USD')).toBe(2);
    expect(minorUnitsOf('KWD')).toBe(3);
    expect(minorUnitsOf('XXX')).toBe(2);
    expect(CURRENCY_MINOR_UNITS.JPY).toBe(0);
  });
  it('rejects non-integer minor in the schema', () => {
    expect(MoneyAmountSchema.safeParse({ minor: 1.5, currency: 'USD' }).success).toBe(false);
    expect(MoneyAmountSchema.safeParse({ minor: 150, currency: 'USD' }).success).toBe(true);
  });
});
