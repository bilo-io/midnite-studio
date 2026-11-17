// vitest/jsdom: pure string logic, no browser capability needed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactMoney, formatMoney } from './format-money';

const cases = () => [
  formatMoney(0, 'ZAR'),
  formatMoney(1_500_000, 'ZAR'),
  formatMoney(123_450, 'ZAR', { decimals: 2 }),
  formatMoney(-420_000, 'ZAR'),
  formatMoney(150, 'ZAR'),
  formatMoney(Number.NaN, 'ZAR'),
  formatCompactMoney(45_000_000, 'ZAR'),
  formatCompactMoney(120_000_000, 'ZAR'),
  formatMoney(150_000, 'USD'),
  formatMoney(6_500, 'JPY'),
  formatMoney(100, 'CHF'),
];
const expected = ['R 0', 'R 15,000', 'R 1,234.50', '−R 4,200', 'R 2', '—', 'R 450k', 'R 1.2m', '$1,500', '¥6,500', 'CHF 1'];

describe('formatMoney', () => {
  it('formats the documented cases', () => {
    expect(cases()).toEqual(expected);
  });
  it('uses each currency symbol and falls back to the code', () => {
    expect(formatMoney(100_000, 'EUR')).toBe('€1,000');
    expect(formatMoney(100_000, 'GBP')).toBe('£1,000');
    expect(formatMoney(100_000, 'ZAR')).toBe('R 1,000');
    expect(formatMoney(100_000, 'AUD')).toBe('AUD 1,000');
  });
  it('treats a currency without minor digits as whole units, even with decimals asked', () => {
    expect(formatMoney(6_500, 'JPY', { decimals: 2 })).toBe('¥6,500');
    expect(formatCompactMoney(1_200_000, 'JPY')).toBe('¥1.2m');
  });
  it('treats -0 and sub-unit negatives as zero', () => {
    expect(formatMoney(-0, 'ZAR')).toBe('R 0');
    expect(formatMoney(-49, 'ZAR')).toBe('R 0');
    expect(formatMoney(-4, 'ZAR', { decimals: 2 })).toBe('−R 0.04');
  });
  it('rounds half away from zero, symmetrically', () => {
    expect(formatMoney(250, 'ZAR')).toBe('R 3');
    expect(formatMoney(-250, 'ZAR')).toBe('−R 3');
    expect(formatMoney(149, 'ZAR')).toBe('R 1');
  });
  it('maps non-finite values to an em dash', () => {
    expect(formatMoney(Infinity, 'USD')).toBe('—');
    expect(formatMoney(-Infinity, 'USD')).toBe('—');
    expect(formatCompactMoney(Number.NaN, 'USD')).toBe('—');
  });
  it('groups millions', () => {
    expect(formatMoney(123_456_789_00, 'ZAR')).toBe('R 123,456,789');
  });
});

describe('formatCompactMoney', () => {
  it('uses plain units below 1,000', () => {
    expect(formatCompactMoney(95_000, 'ZAR')).toBe('R 950');
    expect(formatCompactMoney(0, 'ZAR')).toBe('R 0');
  });
  it('keeps one decimal below 10k, none above', () => {
    expect(formatCompactMoney(450_000, 'USD')).toBe('$4.5k');
    expect(formatCompactMoney(400_000, 'USD')).toBe('$4k');
    expect(formatCompactMoney(1_500_000, 'USD')).toBe('$15k');
  });
  it('promotes at the boundaries', () => {
    expect(formatCompactMoney(99_960, 'ZAR')).toBe('R 1k');
    expect(formatCompactMoney(99_950_000, 'ZAR')).toBe('R 1m');
  });
  it('applies the sign rule', () => {
    expect(formatCompactMoney(-45_000_000, 'ZAR')).toBe('−R 450k');
  });
});

describe('locale independence', () => {
  const origLang = process.env.LANG;
  afterEach(() => {
    process.env.LANG = origLang;
    vi.unstubAllGlobals();
  });
  it('gives the same output under de_DE with Intl.NumberFormat throwing', () => {
    process.env.LANG = 'de_DE.UTF-8';
    vi.stubGlobal('Intl', {
      NumberFormat: () => {
        throw new Error('Intl must not be used');
      },
    });
    const spy = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
      throw new Error('toLocaleString must not be used');
    });
    try {
      expect(cases()).toEqual(expected);
    } finally {
      spy.mockRestore();
    }
  });
});
