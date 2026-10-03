import {
  MARKET_CATALOGUE,
  catalogueAsset,
  type MarketAsset,
  type MarketQuoteEntry,
  type MarketSeriesEntry,
  type MarketTimescale,
} from '@midnite/studio-shared';

import { MAX_SERIES_POINTS, downsample, trimToTimescale } from './candles';
import type { DiskCache } from './disk-cache';
import { RateLimitedError, getJson, type Fetcher } from './http';
import {
  parseBinanceKlines,
  parseCnbcChart,
  parseCoingeckoOhlc,
  parseCoingeckoSearch,
  parseNasdaqSearch,
  parseRates,
  parseYahooChart,
  type SearchHit,
} from './parsers';
import type { MarketCandle } from '@midnite/studio-shared';

/**
 * Market data for the Finance dashboard — all key-free, all fetched here in
 * main, all in USD.
 *
 * Providers, chosen because each was verified to answer without a key:
 *
 * - **stocks / ETFs** — CNBC's chart service (OHLC at every timescale), with
 *   Yahoo's chart endpoint as the second source. Yahoo is the better-known one
 *   but answers 429 to a lot of networks; CNBC is first because it answers
 *   everywhere we tried.
 * - **crypto** — Binance's public market-data host (`data-api.binance.vision`,
 *   klines), with CoinGecko's OHLC as the second source.
 * - **search** — Nasdaq's autocomplete for equities and ETFs, CoinGecko's
 *   search for coins, merged behind the curated catalogue.
 * - **FX** — open.er-api.com, with Frankfurter as the second source.
 *
 * Failure is a normal outcome. A provider that rate limits is skipped for a
 * minute; if every provider fails the last cached answer is served marked
 * `stale`, and only when there is no cache either does a series carry an
 * `error` for the card to render.
 */

export type MarketsServiceOptions = {
  fetcher: Fetcher;
  cache: DiskCache;
  now?: () => number;
};

type Provider = {
  name: string;
  fetch: (asset: MarketAsset, timescale: MarketTimescale) => Promise<MarketCandle[]>;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

/** How long a cached series is considered fresh, per timescale. */
export const SERIES_TTL_MS: Record<MarketTimescale, number> = {
  '1D': 2 * MIN,
  '1W': 10 * MIN,
  '1M': 30 * MIN,
  '3M': 2 * HOUR,
  '1Y': 2 * HOUR,
  '5Y': 6 * HOUR,
  ALL: 6 * HOUR,
};

export const RATES_TTL_MS = HOUR;
const SEARCH_TTL_MS = 24 * HOUR;
const COOLDOWN_MS = MIN;
const CONCURRENCY = 4;

const CNBC_RANGE: Record<MarketTimescale, string> = {
  '1D': '1D',
  '1W': '5D',
  '1M': '1M',
  '3M': '3M',
  '1Y': '1Y',
  '5Y': '5Y',
  ALL: 'ALL',
};

const YAHOO_PARAMS: Record<MarketTimescale, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '30m' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  ALL: { range: 'max', interval: '1mo' },
};

const BINANCE_PARAMS: Record<MarketTimescale, { interval: string; limit: number }> = {
  '1D': { interval: '15m', limit: 96 },
  '1W': { interval: '1h', limit: 168 },
  '1M': { interval: '4h', limit: 180 },
  '3M': { interval: '12h', limit: 180 },
  '1Y': { interval: '1d', limit: 365 },
  '5Y': { interval: '1w', limit: 261 },
  ALL: { interval: '1w', limit: 1000 },
};

const COINGECKO_DAYS: Record<MarketTimescale, string> = {
  '1D': '1',
  '1W': '7',
  '1M': '30',
  '3M': '90',
  '1Y': '365',
  '5Y': '365',
  ALL: '365',
};

export type MarketsService = ReturnType<typeof createMarketsService>;

export function createMarketsService(options: MarketsServiceOptions) {
  const { fetcher, cache } = options;
  const now = options.now ?? Date.now;

  const cooldownUntil = new Map<string, number>();
  const inflight = new Map<string, Promise<MarketSeriesEntry>>();
  const searchMemo = new Map<string, { at: number; hits: (SearchHit & { exchange?: string })[] }>();

  const json = (provider: string, url: string): Promise<unknown> => getJson(fetcher, provider, url);

  const providersFor = (asset: MarketAsset): Provider[] => {
    if (asset.kind === 'crypto') {
      const providers: Provider[] = [
        {
          name: 'Binance',
          fetch: async (a, ts) => {
            const { interval, limit } = BINANCE_PARAMS[ts];
            return parseBinanceKlines(
              await json(
                'Binance',
                `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(a.symbol.toUpperCase())}USDT&interval=${interval}&limit=${limit}`,
              ),
            );
          },
        },
      ];
      const geckoId = catalogueAsset(asset.symbol)?.coingeckoId;
      if (geckoId) {
        providers.push({
          name: 'CoinGecko',
          fetch: async (_a, ts) =>
            parseCoingeckoOhlc(
              await json(
                'CoinGecko',
                `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(geckoId)}/ohlc?vs_currency=usd&days=${COINGECKO_DAYS[ts]}`,
              ),
            ),
        });
      }
      return providers;
    }
    return [
      {
        name: 'CNBC',
        fetch: async (a, ts) =>
          parseCnbcChart(
            await json(
              'CNBC',
              `https://ts-api.cnbc.com/harmony/app/charts/${CNBC_RANGE[ts]}.json?symbol=${encodeURIComponent(a.symbol.toUpperCase())}`,
            ),
          ),
      },
      {
        name: 'Yahoo Finance',
        fetch: async (a, ts) => {
          const { range, interval } = YAHOO_PARAMS[ts];
          return parseYahooChart(
            await json(
              'Yahoo Finance',
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.symbol.toUpperCase())}?range=${range}&interval=${interval}`,
            ),
          );
        },
      },
    ];
  };

  const cacheKey = (asset: MarketAsset, ts: MarketTimescale): string => `series.${asset.symbol.toUpperCase()}.${ts}`;

  async function loadSeries(
    asset: MarketAsset,
    timescale: MarketTimescale,
    force: boolean,
  ): Promise<MarketSeriesEntry> {
    const key = cacheKey(asset, timescale);
    const fresh = force ? null : await cache.read<MarketCandle[]>(key, SERIES_TTL_MS[timescale]);
    if (fresh) {
      return { candles: fresh.value, fetchedAt: fresh.fetchedAt, stale: false, source: fresh.source };
    }

    let lastError = 'No market data provider answered.';
    for (const provider of providersFor(asset)) {
      if ((cooldownUntil.get(provider.name) ?? 0) > now()) {
        lastError = `${provider.name} is rate limiting requests`;
        continue;
      }
      try {
        const raw = await provider.fetch(asset, timescale);
        const candles = downsample(trimToTimescale(raw, timescale), MAX_SERIES_POINTS);
        if (candles.length === 0) {
          lastError = `${provider.name} has no data for ${asset.symbol}`;
          continue;
        }
        const fetchedAt = now();
        await cache.write(key, { fetchedAt, source: provider.name, value: candles }).catch(() => undefined);
        return { candles, fetchedAt, stale: false, source: provider.name };
      } catch (error) {
        if (error instanceof RateLimitedError) cooldownUntil.set(provider.name, now() + COOLDOWN_MS);
        lastError = error instanceof Error ? error.message : 'Provider failed';
      }
    }

    const old = await cache.readAny<MarketCandle[]>(key);
    if (old) return { candles: old.value, fetchedAt: old.fetchedAt, stale: true, source: old.source };
    return { candles: [], fetchedAt: null, stale: false, source: null, error: lastError };
  }

  /** Concurrent callers for the same series share one fetch. */
  function getSeries(
    asset: MarketAsset,
    timescale: MarketTimescale,
    force = false,
  ): Promise<MarketSeriesEntry> {
    const key = cacheKey(asset, timescale);
    const running = inflight.get(key);
    if (running) return running;
    const promise = loadSeries(asset, timescale, force).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function mapLimited<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const lane = async (): Promise<void> => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await work(items[index] as T);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, lane));
    return results;
  }

  async function getSeriesBatch(
    assets: readonly MarketAsset[],
    timescale: MarketTimescale,
    force = false,
  ): Promise<Record<string, MarketSeriesEntry>> {
    const unique = [...new Map(assets.map((a) => [a.symbol, a])).values()];
    const entries = await mapLimited(unique, (asset) => getSeries(asset, timescale, force));
    return Object.fromEntries(unique.map((asset, i) => [asset.symbol, entries[i] as MarketSeriesEntry]));
  }

  /** The latest price is the last close of the one-day series — one source of truth for "now". */
  async function getQuoteBatch(
    assets: readonly MarketAsset[],
    force = false,
  ): Promise<Record<string, MarketQuoteEntry>> {
    const series = await getSeriesBatch(assets, '1D', force);
    return Object.fromEntries(
      Object.entries(series).map(([symbol, entry]) => {
        const last = entry.candles[entry.candles.length - 1];
        return [
          symbol,
          last
            ? { price: last.c, t: last.t, stale: entry.stale }
            : { price: null, t: null, stale: false, error: entry.error ?? 'No price available' },
        ];
      }),
    );
  }

  async function getRates(): Promise<{
    base: 'USD';
    rates: Record<string, number>;
    fetchedAt: number | null;
    stale: boolean;
  }> {
    const fresh = await cache.read<Record<string, number>>('rates', RATES_TTL_MS);
    if (fresh) return { base: 'USD', rates: fresh.value, fetchedAt: fresh.fetchedAt, stale: false };

    const sources: [string, string][] = [
      ['open.er-api.com', 'https://open.er-api.com/v6/latest/USD'],
      ['Frankfurter', 'https://api.frankfurter.dev/v1/latest?base=USD'],
    ];
    for (const [name, url] of sources) {
      try {
        const rates = parseRates(await json(name, url));
        if (!rates) continue;
        const fetchedAt = now();
        await cache.write('rates', { fetchedAt, source: name, value: rates }).catch(() => undefined);
        return { base: 'USD', rates, fetchedAt, stale: false };
      } catch {
        // try the next source
      }
    }
    const old = await cache.readAny<Record<string, number>>('rates');
    if (old) return { base: 'USD', rates: old.value, fetchedAt: old.fetchedAt, stale: true };
    // Nothing fetched, nothing cached: USD is the only honest answer.
    return { base: 'USD', rates: { USD: 1 }, fetchedAt: null, stale: true };
  }

  async function search(query: string): Promise<(MarketAsset & { exchange?: string })[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const local = MARKET_CATALOGUE.filter(
      (a) => a.symbol.toLowerCase().startsWith(needle) || a.name.toLowerCase().includes(needle),
    )
      .sort((a, b) => Number(b.symbol.toLowerCase() === needle) - Number(a.symbol.toLowerCase() === needle))
      .map(({ symbol, name, kind }) => ({ symbol, name, kind }));

    const memo = searchMemo.get(needle);
    let remote: (SearchHit & { exchange?: string })[];
    if (memo && now() - memo.at < SEARCH_TTL_MS) {
      remote = memo.hits;
    } else {
      const [stocks, coins] = await Promise.allSettled([
        json('Nasdaq', `https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(needle)}`).then(
          parseNasdaqSearch,
        ),
        json('CoinGecko', `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(needle)}`).then((raw) =>
          parseCoingeckoSearch(raw).slice(0, 6),
        ),
      ]);
      remote = [
        ...(stocks.status === 'fulfilled' ? stocks.value.slice(0, 8) : []),
        ...(coins.status === 'fulfilled' ? coins.value : []),
      ];
      // Only remember a search that produced something — an outage must not stick for a day.
      if (remote.length > 0) searchMemo.set(needle, { at: now(), hits: remote });
    }

    const seen = new Set(local.map((a) => a.symbol));
    const merged: (MarketAsset & { exchange?: string })[] = [...local];
    for (const hit of remote) {
      if (seen.has(hit.symbol)) continue;
      seen.add(hit.symbol);
      merged.push({
        symbol: hit.symbol,
        name: hit.name,
        kind: hit.kind,
        ...(hit.exchange ? { exchange: hit.exchange } : {}),
      });
    }
    return merged.slice(0, 12);
  }

  return { getSeries, getSeriesBatch, getQuoteBatch, getRates, search };
}
