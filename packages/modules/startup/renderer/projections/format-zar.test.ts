// vitest/jsdom: pure string logic, no browser capability needed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCompactZar, formatZar } from './format-zar';

const cases = () => [
  formatZar(0),
  formatZar(1_500_000),
  formatZar(123_450, { decimals: 2 }),
  formatZar(-420_000),
  formatZar(150),
  formatZar(Number.NaN),
  formatCompactZar(45_000_000),
  formatCompactZar(120_000_000),
];
const expected = ['R 0', 'R 15,000', 'R 1,234.50', '−R 4,200', 'R 2', '—', 'R 450k', 'R 1.2m'];

describe('formatZar', () => {
  it('formats the documented cases', () => {
    expect(cases()).toEqual(expected);
  });
  it('treats -0 and sub-rand negatives as R 0', () => {
    expect(formatZar(-0)).toBe('R 0');
    expect(formatZar(-49)).toBe('R 0');
    expect(formatZar(-4, { decimals: 2 })).toBe('−R 0.04');
  });
  it('rounds half away from zero, symmetrically', () => {
    expect(formatZar(250)).toBe('R 3');
    expect(formatZar(-250)).toBe('−R 3');
    expect(formatZar(149)).toBe('R 1');
  });
  it('maps non-finite values to an em dash', () => {
    expect(formatZar(Infinity)).toBe('—');
    expect(formatZar(-Infinity)).toBe('—');
    expect(formatCompactZar(Number.NaN)).toBe('—');
  });
  it('groups millions', () => {
    expect(formatZar(123_456_789_00)).toBe('R 123,456,789');
  });
});

describe('formatCompactZar', () => {
  it('uses plain rands below R 1,000', () => {
    expect(formatCompactZar(95_000)).toBe('R 950');
    expect(formatCompactZar(0)).toBe('R 0');
  });
  it('keeps one decimal below R 10k, none above', () => {
    expect(formatCompactZar(450_000)).toBe('R 4.5k');
    expect(formatCompactZar(400_000)).toBe('R 4k');
    expect(formatCompactZar(1_500_000)).toBe('R 15k');
  });
  it('promotes at the boundaries', () => {
    expect(formatCompactZar(99_960)).toBe('R 1k');
    expect(formatCompactZar(99_950_000)).toBe('R 1m');
  });
  it('applies the sign rule', () => {
    expect(formatCompactZar(-45_000_000)).toBe('−R 450k');
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
