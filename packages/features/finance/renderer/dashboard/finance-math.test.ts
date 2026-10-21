import type { MarketCandle, MarketPortfolio } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { formatAge, formatMoney, formatPct, formatQuantity, formatSignedPct, formatUsd, maskedCard } from './finance-format';
import {
  allocation,
  nextSort,
  portfolioValue,
  scaleCandles,
  seriesChange,
  sortRows,
  type AssetRow,
} from './finance-math';

const candle = (t: number, c: number): MarketCandle => ({ t, o: c, h: c, l: c, c });
const RATES = { USD: 1, ZAR: 20, EUR: 0.9 };

const portfolio = (patch: Partial<MarketPortfolio> = {}): MarketPortfolio => ({
  version: 1,
  balances: { USD: 100, ZAR: 2000 },
  holdings: [
    { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5 },
    { symbol: 'AAPL', name: 'Apple', kind: 'stock', quantity: 10 },
  ],
  transactions: [],
  watchlist: [],
  extraAssets: [],
  ...patch,
});

const quotes = {
  BTC: { price: 60_000, t: 1, stale: false },
  AAPL: { price: 200, t: 1, stale: false },
};

describe('seriesChange', () => {
  it('is null for an empty series', () => {
    expect(seriesChange([])).toBeNull();
  });

  it('measures close to close, with direction', () => {
    expect(seriesChange([candle(1, 100), candle(2, 125)])).toEqual({ first: 100, last: 125, abs: 25, pct: 25, direction: 'up' });
    expect(seriesChange([candle(1, 100), candle(2, 80)])).toMatchObject({ abs: -20, pct: -20, direction: 'down' });
  });

  it('is flat for a single candle and for a negligible move', () => {
    expect(seriesChange([candle(1, 100)])).toMatchObject({ abs: 0, pct: 0, direction: 'flat' });
    expect(seriesChange([candle(1, 100), candle(2, 100.0001)])?.direction).toBe('flat');
  });
});

describe('scaleCandles', () => {
  it('multiplies every price and keeps the clock and volume', () => {
    const out = scaleCandles([{ t: 5, o: 1, h: 3, l: 0.5, c: 2, v: 9 }], 20);
    expect(out).toEqual([{ t: 5, o: 20, h: 60, l: 10, c: 40, v: 9 }]);
  });
});

describe('portfolioValue', () => {
  it('adds priced holdings to cash converted through the rate table', () => {
    // 0.5 * 60,000 + 10 * 200 = 32,000; cash = 100 + 2000/20 = 200
    expect(portfolioValue(portfolio(), quotes, RATES)).toEqual({ assetsUsd: 32_000, cashUsd: 200, totalUsd: 32_200, unpriced: [] });
  });

  it('reports a holding with no price instead of valuing it at zero silently', () => {
    const out = portfolioValue(portfolio(), { BTC: quotes.BTC }, RATES);
    expect(out.unpriced).toEqual(['AAPL']);
    expect(out.assetsUsd).toBe(30_000);
  });

  it('handles an empty portfolio', () => {
    expect(portfolioValue(portfolio({ balances: {}, holdings: [] }), undefined, RATES)).toEqual({
      assetsUsd: 0,
      cashUsd: 0,
      totalUsd: 0,
      unpriced: [],
    });
  });
});

describe('allocation', () => {
  it('slices holdings by value, largest first, with shares summing to one', () => {
    const slices = allocation(portfolio(), quotes, RATES, false);
    expect(slices.map((s) => s.id)).toEqual(['BTC', 'AAPL']);
    expect(slices[0]).toMatchObject({ valueUsd: 30_000, color: '#F7931A', kind: 'asset' });
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10);
  });

  it('adds cash as its own neutral slice when asked', () => {
    const slices = allocation(portfolio(), quotes, RATES, true);
    expect(slices.at(-1)).toMatchObject({ id: 'cash', kind: 'cash', valueUsd: 200 });
  });

  it('drops unpriced and zero holdings, and is empty with nothing to draw', () => {
    expect(allocation(portfolio(), { BTC: quotes.BTC }, RATES, false).map((s) => s.id)).toEqual(['BTC']);
    expect(allocation(portfolio({ balances: {}, holdings: [] }), quotes, RATES, true)).toEqual([]);
  });
});

describe('sortRows', () => {
  const row = (name: string, patch: Partial<AssetRow> = {}): AssetRow => ({
    asset: { symbol: name.slice(0, 3).toUpperCase(), name, kind: 'stock' },
    priceUsd: 10,
    change: { first: 10, last: 10, abs: 0, pct: 0, direction: 'flat' },
    quantity: 0,
    valueUsd: null,
    spark: [],
    stale: false,
    ...patch,
  });
  const rows = [
    row('Bravo', { priceUsd: 50, valueUsd: 500, change: { first: 1, last: 2, abs: 1, pct: 100, direction: 'up' } }),
    row('Alpha', { priceUsd: 5, valueUsd: 900, change: { first: 10, last: 9, abs: -1, pct: -10, direction: 'down' } }),
    row('Charlie', { priceUsd: null, valueUsd: null, change: null }),
    row('Delta', { priceUsd: 20, valueUsd: 100, change: { first: 100, last: 105, abs: 5, pct: 5, direction: 'up' } }),
  ];
  const names = (key: Parameters<typeof sortRows>[1], dir: 'asc' | 'desc') => sortRows(rows, key, dir).map((r) => r.asset.name);

  it('sorts by name', () => {
    expect(names('name', 'asc')).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(names('name', 'desc')).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by price, with the unpriced last in both directions', () => {
    expect(names('price', 'asc')).toEqual(['Alpha', 'Delta', 'Bravo', 'Charlie']);
    expect(names('price', 'desc')).toEqual(['Bravo', 'Delta', 'Alpha', 'Charlie']);
  });

  it('sorts by value', () => {
    expect(names('value', 'desc')).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie']);
  });

  it('sorts by absolute and by percentage gain independently', () => {
    expect(names('gain', 'desc')).toEqual(['Delta', 'Bravo', 'Alpha', 'Charlie']);
    expect(names('gainPct', 'desc')).toEqual(['Bravo', 'Delta', 'Alpha', 'Charlie']);
    expect(names('gainPct', 'asc')).toEqual(['Alpha', 'Delta', 'Bravo', 'Charlie']);
  });

  it('does not mutate its input and breaks ties by name', () => {
    const copy = [...rows];
    sortRows(rows, 'price', 'asc');
    expect(rows).toEqual(copy);
    const ties = [row('Zed'), row('Abe')];
    expect(sortRows(ties, 'price', 'asc').map((r) => r.asset.name)).toEqual(['Abe', 'Zed']);
  });

  it('flips direction on the same key and starts a new key in its natural direction', () => {
    expect(nextSort({ key: 'price', dir: 'desc' }, 'price')).toEqual({ key: 'price', dir: 'asc' });
    expect(nextSort({ key: 'price', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'gain')).toEqual({ key: 'gain', dir: 'desc' });
  });
});

describe('formatting', () => {
  it('formats money in the given currency and converts USD through rates', () => {
    expect(formatMoney(1234.5, 'USD')).toMatch(/\$1,234\.50/);
    expect(formatUsd(10, 'ZAR', RATES)).toMatch(/200\.00/);
    expect(formatUsd(null, 'USD', RATES)).toBe('—');
    expect(formatMoney(Number.NaN, 'USD')).toBe('—');
  });

  it('shows more digits for sub-unit prices', () => {
    expect(formatMoney(0.1234, 'USD')).toMatch(/0\.1234/);
    expect(formatMoney(0.000123, 'USD')).toMatch(/0\.000123/);
  });

  it('survives an unknown currency code', () => {
    expect(formatMoney(5, 'ZZZ')).toContain('5');
  });

  it('formats percentages with a real minus and an explicit plus', () => {
    expect(formatSignedPct(1.234)).toBe('+1.23%');
    expect(formatSignedPct(-0.4)).toBe('−0.40%');
    expect(formatPct(-3.456, 1)).toBe('3.5%');
    expect(formatSignedPct(Number.NaN)).toBe('—');
  });

  it('formats quantities and ages', () => {
    expect(formatQuantity(0.12345678912)).toBe('0.12345679');
    expect(formatQuantity(12.3456789)).toBe('12.3457');
    expect(formatAge(null)).toBe('unknown');
    expect(formatAge(1000, 1000 + 10_000)).toBe('just now');
    expect(formatAge(0, 5 * 60_000)).toBe('5m ago');
    expect(formatAge(0, 3 * 3_600_000)).toBe('3h ago');
    expect(formatAge(0, 49 * 3_600_000)).toBe('2d ago');
  });

  it('masks a card number', () => {
    expect(maskedCard('4821')).toBe('•••• 4821');
  });
});
