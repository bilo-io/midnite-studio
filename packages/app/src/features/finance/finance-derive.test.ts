import { describe, expect, it } from 'vitest';

import { assetTicker, fmtPct, fmtPrice, historyChange } from './finance-derive';

describe('fmtPrice', () => {
  it('uses two decimals for dollar-and-up amounts', () => {
    expect(fmtPrice(1234.5)).toBe('$1,234.50');
  });

  it('uses more decimals for sub-cent crypto amounts', () => {
    expect(fmtPrice(0.0000123)).toBe('$0.000012');
  });

  it('honours a non-USD currency', () => {
    expect(fmtPrice(10, 'EUR')).toBe('€10.00');
  });
});

describe('fmtPct', () => {
  it('signs a gain with a leading plus', () => {
    expect(fmtPct(3.456)).toBe('+3.46%');
  });

  it('leaves a loss with its own minus', () => {
    expect(fmtPct(-1.2)).toBe('-1.20%');
  });
});

describe('assetTicker', () => {
  it('extracts symbol from parenthesized names', () => {
    expect(assetTicker({ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' })).toBe('BTC');
    expect(assetTicker({ kind: 'crypto', symbol: 'ethereum', name: 'Ethereum (ETH)' })).toBe('ETH');
  });

  it('falls back to symbol in uppercase if no parenthesis', () => {
    expect(assetTicker({ kind: 'stock', symbol: 'aapl', name: 'Apple Inc' })).toBe('AAPL');
    expect(assetTicker({ kind: 'crypto', symbol: 'solana', name: 'Solana' })).toBe('SOLANA');
  });
});

describe('historyChange', () => {
  it('is null/up with no points at all', () => {
    expect(historyChange([])).toEqual({ pct: null, up: true });
  });

  it('is a flat zero-percent change with a single point', () => {
    expect(historyChange([{ t: 0, c: 10 }])).toEqual({ pct: 0, up: true });
  });

  it('computes percent change from the first and last close', () => {
    const points = [
      { t: 0, c: 100 },
      { t: 1, c: 150 },
      { t: 2, c: 110 },
    ];
    expect(historyChange(points)).toEqual({ pct: 10, up: true });
  });

  it('flags a decline as not up', () => {
    const points = [
      { t: 0, c: 100 },
      { t: 1, c: 90 },
    ];
    const { pct, up } = historyChange(points);
    expect(pct).toBeCloseTo(-10);
    expect(up).toBe(false);
  });
});
