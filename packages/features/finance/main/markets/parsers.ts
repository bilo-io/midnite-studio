import type { MarketCandle } from '@midnite/studio-shared';

import { cleanCandles } from './candles';

/**
 * One parser per provider, each tolerant of the odd missing field — public
 * endpoints change shape without notice, and a parser that throws on a null
 * turns a partial answer into no answer.
 */

const num = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value.replace(/[$,]/g, '')) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : Number.NaN;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** CNBC's `ts-api` chart: `{ barData: { priceBars: [{ open, high, low, close, volume, tradeTimeinMills }] } }`. */
export function parseCnbcChart(raw: unknown): MarketCandle[] {
  const bars = isObject(raw) && isObject(raw.barData) ? raw.barData.priceBars : undefined;
  if (!Array.isArray(bars)) return [];
  return cleanCandles(
    bars.filter(isObject).map((bar) => ({
      t: num(bar.tradeTimeinMills),
      o: num(bar.open),
      h: num(bar.high),
      l: num(bar.low),
      c: num(bar.close),
      v: num(bar.volume),
    })).map(dropNaNVolume),
  );
}

/** Yahoo's v8 chart: parallel arrays under `indicators.quote[0]`, seconds-based `timestamp`. */
export function parseYahooChart(raw: unknown): MarketCandle[] {
  const result =
    isObject(raw) && isObject(raw.chart) && Array.isArray(raw.chart.result)
      ? raw.chart.result[0]
      : undefined;
  if (!isObject(result) || !Array.isArray(result.timestamp)) return [];
  const indicators = isObject(result.indicators) ? result.indicators : {};
  const quote = Array.isArray(indicators.quote) ? indicators.quote[0] : undefined;
  if (!isObject(quote)) return [];
  const column = (key: string): unknown[] => (Array.isArray(quote[key]) ? (quote[key] as unknown[]) : []);
  const [open, high, low, close, volume] = ['open', 'high', 'low', 'close', 'volume'].map(column);
  return cleanCandles(
    (result.timestamp as unknown[]).map((ts, i) =>
      dropNaNVolume({
        t: num(ts) * 1000,
        o: num(open?.[i]),
        h: num(high?.[i]),
        l: num(low?.[i]),
        c: num(close?.[i]),
        v: num(volume?.[i]),
      }),
    ),
  );
}

/** Binance klines: `[openTime, open, high, low, close, volume, …]`, prices as strings. */
export function parseBinanceKlines(raw: unknown): MarketCandle[] {
  if (!Array.isArray(raw)) return [];
  return cleanCandles(
    raw
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) =>
        dropNaNVolume({ t: num(row[0]), o: num(row[1]), h: num(row[2]), l: num(row[3]), c: num(row[4]), v: num(row[5]) }),
      ),
  );
}

/** CoinGecko `/ohlc`: `[t, o, h, l, c]` rows, no volume. */
export function parseCoingeckoOhlc(raw: unknown): MarketCandle[] {
  if (!Array.isArray(raw)) return [];
  return cleanCandles(
    raw
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => ({ t: num(row[0]), o: num(row[1]), h: num(row[2]), l: num(row[3]), c: num(row[4]) })),
  );
}

function dropNaNVolume(candle: MarketCandle): MarketCandle {
  if (candle.v !== undefined && !Number.isFinite(candle.v)) {
    const { v: _v, ...rest } = candle;
    return rest;
  }
  return candle;
}

/** Units per USD from open.er-api.com (`rates`) or Frankfurter (`rates`) — same shape. */
export function parseRates(raw: unknown): Record<string, number> | null {
  if (!isObject(raw) || !isObject(raw.rates)) return null;
  const out: Record<string, number> = { USD: 1 };
  for (const [code, value] of Object.entries(raw.rates)) {
    const n = num(value);
    if (/^[A-Z]{3}$/.test(code) && n > 0) out[code] = n;
  }
  return Object.keys(out).length > 3 ? out : null;
}

export type SearchHit = { symbol: string; name: string; kind: 'crypto' | 'stock' | 'etf'; exchange?: string };

/** Nasdaq `autocomplete/slookup`: `{ data: [{ symbol, name, asset: 'STOCKS' | 'ETF' | … }] }`. */
export function parseNasdaqSearch(raw: unknown): SearchHit[] {
  const rows = isObject(raw) && Array.isArray(raw.data) ? raw.data : [];
  const out: SearchHit[] = [];
  for (const row of rows) {
    if (!isObject(row) || typeof row.symbol !== 'string' || typeof row.name !== 'string') continue;
    const asset = String(row.asset ?? '').toUpperCase();
    if (asset !== 'STOCKS' && asset !== 'ETF') continue;
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(row.symbol)) continue;
    out.push({
      symbol: row.symbol,
      name: row.name.replace(/\s+(Common Stock|Class [A-Z] Common Stock|Ordinary Shares?)$/i, ''),
      kind: asset === 'ETF' ? 'etf' : 'stock',
      ...(typeof row.exchange === 'string' && row.exchange ? { exchange: row.exchange } : {}),
    });
  }
  return out;
}

/** CoinGecko `/search`: `{ coins: [{ id, name, symbol }] }`. */
export function parseCoingeckoSearch(raw: unknown): (SearchHit & { coingeckoId: string })[] {
  const rows = isObject(raw) && Array.isArray(raw.coins) ? raw.coins : [];
  const out: (SearchHit & { coingeckoId: string })[] = [];
  for (const row of rows) {
    if (!isObject(row) || typeof row.symbol !== 'string' || typeof row.name !== 'string') continue;
    const symbol = row.symbol.toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) continue;
    out.push({ symbol, name: row.name, kind: 'crypto', coingeckoId: String(row.id ?? '') });
  }
  return out;
}
