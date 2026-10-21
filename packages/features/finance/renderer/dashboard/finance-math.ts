import {
  assetColor,
  currencyToUsd,
  usdToCurrency,
  type MarketAsset,
  type MarketCandle,
  type MarketPortfolio,
  type MarketQuoteEntry,
  type MarketRates,
} from '@midnite/studio-shared';

/**
 * The Finance dashboard's arithmetic, kept out of the components so each rule
 * — how a gain is measured, what counts as the portfolio's value, how a list
 * sorts — is one tested function rather than a re-derivation per card.
 */

export type Direction = 'up' | 'down' | 'flat';

export type SeriesChange = {
  first: number;
  last: number;
  abs: number;
  pct: number;
  direction: Direction;
};

/** A move smaller than this reads as flat — below the precision a price is quoted to. */
const FLAT_PCT = 0.005;

/** Close-to-close change across a series. Null with fewer than one candle. */
export function seriesChange(candles: readonly MarketCandle[]): SeriesChange | null {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) return null;
  const abs = last.c - first.c;
  const pct = first.c > 0 ? (abs / first.c) * 100 : 0;
  return { first: first.c, last: last.c, abs, pct, direction: Math.abs(pct) < FLAT_PCT ? 'flat' : abs > 0 ? 'up' : 'down' };
}

/** Candles with every price multiplied by `rate` — USD → display currency, for the chart. */
export const scaleCandles = (candles: readonly MarketCandle[], rate: number): MarketCandle[] =>
  rate === 1 ? [...candles] : candles.map((c) => ({ ...c, o: c.o * rate, h: c.h * rate, l: c.l * rate, c: c.c * rate }));

export const closes = (candles: readonly MarketCandle[]): number[] => candles.map((c) => c.c);

export const quotePrice = (quotes: Record<string, MarketQuoteEntry> | undefined, symbol: string): number | null =>
  quotes?.[symbol]?.price ?? null;

// --- portfolio value ----------------------------------------------------------------

export type PortfolioValue = {
  /** USD value of every holding that has a price. */
  assetsUsd: number;
  /** USD value of every cash balance, through the rate table. */
  cashUsd: number;
  totalUsd: number;
  /** Holdings that have no price right now — a total that excludes them should say so. */
  unpriced: string[];
};

export function portfolioValue(
  portfolio: MarketPortfolio,
  quotes: Record<string, MarketQuoteEntry> | undefined,
  rates: MarketRates,
): PortfolioValue {
  let assetsUsd = 0;
  const unpriced: string[] = [];
  for (const holding of portfolio.holdings) {
    const price = quotePrice(quotes, holding.symbol);
    if (price === null) unpriced.push(holding.symbol);
    else assetsUsd += holding.quantity * price;
  }
  const cashUsd = Object.entries(portfolio.balances).reduce(
    (sum, [currency, amount]) => sum + currencyToUsd(amount, currency, rates),
    0,
  );
  return { assetsUsd, cashUsd, totalUsd: assetsUsd + cashUsd, unpriced };
}

export type AllocationSlice = {
  id: string;
  label: string;
  color: string;
  valueUsd: number;
  /** 0–1 of the total drawn. */
  share: number;
  kind: 'asset' | 'cash';
};

/** Colour for the cash slice — deliberately neutral, so it never reads as an asset. */
export const CASH_COLOR = '#94A3B8';

/**
 * Allocation across holdings, plus cash as one slice when asked for. Zero- and
 * unpriced slices are dropped (a zero-width arc is an invisible legend row),
 * and slices sort largest first so the donut reads clockwise from the biggest.
 */
export function allocation(
  portfolio: MarketPortfolio,
  quotes: Record<string, MarketQuoteEntry> | undefined,
  rates: MarketRates,
  includeCash: boolean,
): AllocationSlice[] {
  const slices: Omit<AllocationSlice, 'share'>[] = [];
  for (const holding of portfolio.holdings) {
    const price = quotePrice(quotes, holding.symbol);
    if (price === null) continue;
    const valueUsd = holding.quantity * price;
    if (valueUsd > 0) slices.push({ id: holding.symbol, label: holding.name, color: assetColor(holding.symbol), valueUsd, kind: 'asset' });
  }
  if (includeCash) {
    const cashUsd = portfolioValue(portfolio, quotes, rates).cashUsd;
    if (cashUsd > 0) slices.push({ id: 'cash', label: 'Cash', color: CASH_COLOR, valueUsd: cashUsd, kind: 'cash' });
  }
  const total = slices.reduce((sum, s) => sum + s.valueUsd, 0);
  return slices
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .map((s) => ({ ...s, share: total > 0 ? s.valueUsd / total : 0 }));
}

// --- list rows + sorting ------------------------------------------------------------

export type AssetRow = {
  asset: MarketAsset;
  priceUsd: number | null;
  change: SeriesChange | null;
  quantity: number;
  /** Position value in USD; null when not held or unpriced. */
  valueUsd: number | null;
  spark: number[];
  stale: boolean;
  error?: string | undefined;
};

export type SortKey = 'name' | 'price' | 'value' | 'gain' | 'gainPct';
export type SortDir = 'asc' | 'desc';

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  price: 'Price',
  value: 'Value',
  gain: 'Gain / loss',
  gainPct: 'Gain / loss %',
};

const sortValue = (row: AssetRow, key: SortKey): number | string | null => {
  switch (key) {
    case 'name':
      return row.asset.name.toLowerCase();
    case 'price':
      return row.priceUsd;
    case 'value':
      return row.valueUsd;
    case 'gain':
      return row.change?.abs ?? null;
    case 'gainPct':
      return row.change?.pct ?? null;
  }
};

/**
 * Sort rows by one key. A row with no value for that key (unpriced, not held)
 * always sorts last whichever way the sort runs — a missing price is not a
 * smaller price, and ranking it as one would put unknowns at the top of
 * "cheapest first".
 */
export function sortRows(rows: readonly AssetRow[], key: SortKey, dir: SortDir): AssetRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.asset.name.localeCompare(b.asset.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const order = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
    return order === 0 ? a.asset.name.localeCompare(b.asset.name) : order * sign;
  });
}

/** What a header click does: a new key starts in its natural direction, the same key flips. */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  key: SortKey,
): { key: SortKey; dir: SortDir } {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'name' ? 'asc' : 'desc' };
}

// --- conversions ----------------------------------------------------------------------

/** Display-currency rate for the chart and the cards: units per USD. */
export const rateFor = (currency: string, rates: MarketRates): number => usdToCurrency(1, currency, rates);
