import { join } from 'node:path';

import { createDiskCache } from './markets/disk-cache';
import { defaultFetcher, type Fetcher } from './markets/http';
import { createMarketsService, type MarketsService } from './markets/markets-service';
import { createPortfolioStore, type PortfolioStore } from './markets/portfolio-store';
import { createNewsService } from './markets/rss';

/** The finance feature's three services, built over one directory. */
export type MarketsRuntime = {
  markets: MarketsService;
  portfolio: PortfolioStore;
  news: ReturnType<typeof createNewsService>;
};

/**
 * Builds the markets runtime rooted at `directory` (the cache sits in
 * `<directory>/cache`, the portfolio beside it). Nothing here knows where that
 * is: desktop roots it at `userData/finance`, Money under its own runtime data
 * directory. `fetcher` defaults to the real network and is what a test swaps.
 */
export function createMarketsRuntime(directory: string, fetcher: Fetcher = defaultFetcher): MarketsRuntime {
  const cache = createDiskCache(join(directory, 'cache'));
  const markets = createMarketsService({ fetcher, cache });
  const portfolio = createPortfolioStore({
    directory,
    getRates: async () => (await markets.getRates()).rates,
    getPrice: async (asset) => (await markets.getQuoteBatch([asset]))[asset.symbol]?.price ?? undefined,
  });
  return { markets, portfolio, news: createNewsService({ fetcher, cache }) };
}
