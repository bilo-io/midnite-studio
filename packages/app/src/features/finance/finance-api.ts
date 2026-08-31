import type { AssetKind, AssetSearchResult, FinanceQuote, HistoryPoint } from './finance-types';

/**
 * Ported from `~/Dev/midnite`'s gateway `MarketService` — CoinGecko for crypto
 * (keyless), Twelve Data for stocks (needs an API key). That app fetched
 * through a NestJS backend with a DB-backed cache; this one has no backend, so
 * these are called straight from the renderer and rely on react-query's own
 * cache + `refetchInterval` (`finance-queries.ts`) instead of a hand-rolled TTL.
 *
 * Only the 7-day window is ported — `finance-panel.tsx` shows one fixed
 * timeframe, not the source app's global-timeframe picker.
 */
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FETCH_TIMEOUT_MS = 5000;

/** CoinGecko `days=7`; Twelve Data hourly candles, matching the source app's 7D row. */
const HISTORY_DAYS = 7;
const STOCK_HISTORY_INTERVAL = '1h';
const STOCK_HISTORY_OUTPUTSIZE = 120;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

// ── Raw provider shapes (only the fields read here) ──
interface CgSearchResponse {
  coins?: { id: string; symbol?: string; name: string }[];
}
interface CgCoinResponse {
  market_data?: {
    current_price?: { usd?: number };
  };
}
interface CgMarketChartResponse {
  prices?: [number, number][];
}
interface TdSearchResponse {
  data?: { symbol: string; instrument_name?: string; exchange?: string }[];
}
interface TdQuoteResponse {
  status?: string;
  message?: string;
  close?: string;
  currency?: string;
}
interface TdTimeSeriesResponse {
  status?: string;
  message?: string;
  values?: { datetime: string; close: string }[];
}

export class StockApiKeyMissingError extends Error {
  constructor() {
    super('Stocks need a Twelve Data API key — add one below.');
  }
}

function requireStockKey(apiKey: string): void {
  if (!apiKey.trim()) throw new StockApiKeyMissingError();
}

// ── CoinGecko (crypto, keyless) ──
async function searchCrypto(query: string): Promise<AssetSearchResult[]> {
  const raw = await fetchJson<CgSearchResponse>(
    `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`,
  );
  return (raw.coins ?? []).slice(0, 10).map((c) => ({
    kind: 'crypto' as const,
    symbol: c.id,
    name: c.symbol ? `${c.name} (${c.symbol.toUpperCase()})` : c.name,
  }));
}

async function quoteCrypto(id: string): Promise<FinanceQuote> {
  const raw = await fetchJson<CgCoinResponse>(
    `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
  );
  return { price: num(raw.market_data?.current_price?.usd), currency: 'USD' };
}

async function historyCrypto(id: string): Promise<HistoryPoint[]> {
  const raw = await fetchJson<CgMarketChartResponse>(
    `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}`,
  );
  return (raw.prices ?? []).map(([t, c]) => ({ t, c }));
}

// ── Twelve Data (stocks, keyed) ──
async function searchStock(query: string, apiKey: string): Promise<AssetSearchResult[]> {
  const raw = await fetchJson<TdSearchResponse>(
    `${TWELVE_DATA_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=10&apikey=${apiKey}`,
  );
  return (raw.data ?? []).slice(0, 10).map((d) => ({
    kind: 'stock' as const,
    symbol: d.symbol,
    name: d.instrument_name ?? d.symbol,
    exchange: d.exchange,
  }));
}

async function quoteStock(symbol: string, apiKey: string): Promise<FinanceQuote> {
  const raw = await fetchJson<TdQuoteResponse>(
    `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
  );
  // Twelve Data signals errors with HTTP 200 + `status: 'error'`.
  if (raw.status === 'error') throw new Error(raw.message ?? 'quote unavailable');
  return { price: num(raw.close), currency: raw.currency ?? 'USD' };
}

async function historyStock(symbol: string, apiKey: string): Promise<HistoryPoint[]> {
  const raw = await fetchJson<TdTimeSeriesResponse>(
    `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${STOCK_HISTORY_INTERVAL}&outputsize=${STOCK_HISTORY_OUTPUTSIZE}&apikey=${apiKey}`,
  );
  if (raw.status === 'error') throw new Error(raw.message ?? 'history unavailable');
  // Twelve Data returns newest-first; reverse to oldest-first for plotting.
  return (raw.values ?? [])
    .map((v) => ({ t: Date.parse(v.datetime), c: num(v.close) }))
    .reverse();
}

// ── Dispatch by kind ──
export async function searchAssets(
  kind: AssetKind,
  query: string,
  apiKey: string,
): Promise<AssetSearchResult[]> {
  if (kind === 'stock') {
    requireStockKey(apiKey);
    return searchStock(query, apiKey);
  }
  return searchCrypto(query);
}

export async function getQuote(kind: AssetKind, symbol: string, apiKey: string): Promise<FinanceQuote> {
  if (kind === 'stock') {
    requireStockKey(apiKey);
    return quoteStock(symbol, apiKey);
  }
  return quoteCrypto(symbol);
}

export async function getHistory(
  kind: AssetKind,
  symbol: string,
  apiKey: string,
): Promise<HistoryPoint[]> {
  if (kind === 'stock') {
    requireStockKey(apiKey);
    return historyStock(symbol, apiKey);
  }
  return historyCrypto(symbol);
}
