/**
 * Finance provider fetches — run in main so API keys and third-party hosts
 * never cross into the renderer (Phase 76 Theme D).
 */
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FETCH_TIMEOUT_MS = 5000;

const HISTORY_DAYS = 7;
const STOCK_HISTORY_INTERVAL = '1h';
const STOCK_HISTORY_OUTPUTSIZE = 120;

export type FinanceAssetKind = 'crypto' | 'stock';

export type FinanceSearchResult = {
  kind: FinanceAssetKind;
  symbol: string;
  name: string;
  exchange?: string;
};

export type FinanceQuote = {
  price: number;
  currency: string;
};

export type FinanceHistoryPoint = { t: number; c: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

interface CgSearchResponse {
  coins?: { id: string; symbol?: string; name: string }[];
}
interface CgCoinResponse {
  market_data?: { current_price?: { usd?: number } };
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

function requireStockKey(apiKey: string | null): string {
  const trimmed = apiKey?.trim() ?? '';
  if (!trimmed) throw new StockApiKeyMissingError();
  return trimmed;
}

export async function searchFinanceAssets(
  kind: FinanceAssetKind,
  query: string,
  twelveDataKey: string | null,
): Promise<FinanceSearchResult[]> {
  if (kind === 'stock') {
    const apiKey = requireStockKey(twelveDataKey);
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

  const raw = await fetchJson<CgSearchResponse>(
    `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`,
  );
  return (raw.coins ?? []).slice(0, 10).map((c) => ({
    kind: 'crypto' as const,
    symbol: c.id,
    name: c.symbol ? `${c.name} (${c.symbol.toUpperCase()})` : c.name,
  }));
}

export async function getFinanceQuote(
  kind: FinanceAssetKind,
  symbol: string,
  twelveDataKey: string | null,
): Promise<FinanceQuote> {
  if (kind === 'stock') {
    const apiKey = requireStockKey(twelveDataKey);
    const raw = await fetchJson<TdQuoteResponse>(
      `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
    );
    if (raw.status === 'error') throw new Error(raw.message ?? 'quote unavailable');
    return { price: num(raw.close), currency: raw.currency ?? 'USD' };
  }

  const raw = await fetchJson<CgCoinResponse>(
    `${COINGECKO_BASE}/coins/${encodeURIComponent(symbol)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
  );
  return { price: num(raw.market_data?.current_price?.usd), currency: 'USD' };
}

export async function getFinanceHistory(
  kind: FinanceAssetKind,
  symbol: string,
  twelveDataKey: string | null,
): Promise<FinanceHistoryPoint[]> {
  if (kind === 'stock') {
    const apiKey = requireStockKey(twelveDataKey);
    const raw = await fetchJson<TdTimeSeriesResponse>(
      `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${STOCK_HISTORY_INTERVAL}&outputsize=${STOCK_HISTORY_OUTPUTSIZE}&apikey=${apiKey}`,
    );
    if (raw.status === 'error') throw new Error(raw.message ?? 'history unavailable');
    return (raw.values ?? [])
      .map((v) => ({ t: Date.parse(v.datetime), c: num(v.close) }))
      .reverse();
  }

  const raw = await fetchJson<CgMarketChartResponse>(
    `${COINGECKO_BASE}/coins/${encodeURIComponent(symbol)}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}`,
  );
  return (raw.prices ?? []).map(([t, c]) => ({ t, c }));
}
