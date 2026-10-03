import { join } from 'node:path';

import { app } from 'electron';

import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import { createDiskCache } from '../finance/markets/disk-cache';
import { defaultFetcher } from '../finance/markets/http';
import { createMarketsService, RATES_TTL_MS, type MarketsService } from '../finance/markets/markets-service';
import { createPortfolioStore, type PortfolioStore } from '../finance/markets/portfolio-store';
import { createNewsService } from '../finance/markets/rss';
import { defaultLogger } from '../log';
import { handle, handleBare } from './handle';

/**
 * IPC for the Finance dashboard. Every channel resolves with a `GitOpResult`
 * and none throws: a provider outage reaches the renderer as stale data or a
 * per-asset `error`, and a refused withdrawal as `{ ok: false, message }`.
 */

const asFailure = (err: unknown): GitOpResult<never> =>
  failure(err instanceof Error ? err.message : 'market data request failed');

const ok = <T,>(value: T) => ({ ok: true as const, value });

export type MarketsRuntime = { markets: MarketsService; portfolio: PortfolioStore; news: ReturnType<typeof createNewsService> };

export function createMarketsRuntime(directory: string): MarketsRuntime {
  const cache = createDiskCache(join(directory, 'cache'));
  const fetcher = defaultFetcher;
  const markets = createMarketsService({ fetcher, cache });
  const portfolio = createPortfolioStore({
    directory,
    getRates: async () => (await markets.getRates()).rates,
    getPrice: async (asset) => (await markets.getQuoteBatch([asset]))[asset.symbol]?.price ?? undefined,
  });
  return { markets, portfolio, news: createNewsService({ fetcher, cache }) };
}

/** Handlers take the runtime so a test can hand them fakes; boot passes the real one. */
export function registerMarketsHandlers(runtime?: MarketsRuntime): void {
  const rt = runtime ?? createMarketsRuntime(join(app.getPath('userData'), 'finance'));
  const warn = (issue: string): GitOpResult<never> => failure(issue);

  handle(
    CHANNELS.marketsSeries,
    schemas.MarketsSeriesRequest,
    async (req) => {
      try {
        return ok({ series: await rt.markets.getSeriesBatch(req.assets, req.timescale) });
      } catch (err) {
        return asFailure(err);
      }
    },
    warn,
  );

  handle(
    CHANNELS.marketsQuotes,
    schemas.MarketsQuotesRequest,
    async (req) => {
      try {
        return ok({ quotes: await rt.markets.getQuoteBatch(req.assets) });
      } catch (err) {
        return asFailure(err);
      }
    },
    warn,
  );

  handle(
    CHANNELS.marketsSearch,
    schemas.MarketsSearchRequest,
    async (req) => {
      try {
        return ok(await rt.markets.search(req.query));
      } catch (err) {
        return asFailure(err);
      }
    },
    warn,
  );

  handleBare(CHANNELS.marketsRates, async () => {
    try {
      return ok(await rt.markets.getRates());
    } catch (err) {
      return asFailure(err);
    }
  });

  handleBare(CHANNELS.marketsPortfolioGet, async () => {
    try {
      return ok(await rt.portfolio.get());
    } catch (err) {
      return asFailure(err);
    }
  });

  handle(
    CHANNELS.marketsPortfolioApply,
    schemas.MarketsPortfolioOpRequest,
    async (op) => {
      try {
        const result = await rt.portfolio.apply(op);
        return result.ok ? ok(result.value) : failure(result.message);
      } catch (err) {
        return asFailure(err);
      }
    },
    warn,
  );

  handle(
    CHANNELS.marketsNews,
    schemas.MarketsNewsRequest,
    async (req) => {
      try {
        return ok(await rt.news.getNews(req.sources, req.limit));
      } catch (err) {
        return asFailure(err);
      }
    },
    warn,
  );

  // Keep the FX table fresh in the background — hourly, and never keeping the
  // process alive. A failed refresh is only logged: the cache still serves.
  const refresh = (): void => {
    rt.markets.getRates().catch((err: unknown) => defaultLogger.warn(`markets: rate refresh failed: ${String(err)}`));
  };
  refresh();
  setInterval(refresh, RATES_TTL_MS).unref();
}
