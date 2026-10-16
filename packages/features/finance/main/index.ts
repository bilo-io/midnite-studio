import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import { financeManifest } from '../manifest';
import type { AccountsService } from './accounts/accounts-service';
import { allocationByAccount } from './accounts/derive';
import { getFinanceHistory, getFinanceQuote, searchFinanceAssets } from './finance-service';
import { defaultFetcher, type Fetcher } from './markets/http';
import { RATES_TTL_MS } from './markets/markets-service';
import type { MarketsRuntime } from './runtime';

export { financeManifest, type FinanceManifest } from '../manifest';
export {
  getFinanceHistory,
  getFinanceQuote,
  searchFinanceAssets,
  StockApiKeyMissingError,
  type FinanceAssetKind,
  type FinanceHistoryPoint,
  type FinanceQuote,
  type FinanceSearchResult,
} from './finance-service';
export { defaultFetcher, type Fetcher } from './markets/http';
export { createMarketsService, RATES_TTL_MS, type MarketsService } from './markets/markets-service';
export { createPortfolioStore, type PortfolioStore } from './markets/portfolio-store';
export { createNewsService } from './markets/rss';
export {
  createAccountsService,
  scrub,
  SNAPSHOT_TTL_MS,
  type AccountsService,
  type CredentialStore,
} from './accounts/accounts-service';
export { CONNECTORS } from './accounts/registry';
export { createMarketsRuntime, type MarketsRuntime } from './runtime';

/**
 * The finance feature's main half (Phase 113 Theme P).
 *
 * The provider fetches, the disk cache, the simulated portfolio and the news
 * reader moved here from `packages/desktop` — none of them imports `electron`.
 * Where the cache and portfolio live is the composer's call (it builds the
 * {@link MarketsRuntime} over a directory it chose), and so is the market-data
 * key: **it is read here, through `twelveDataKey`, and answers no channel.**
 * The renderer is told whether one is set (`secretsHas`), never what it is.
 */
export type FinanceMainServices = {
  /** The cache + portfolio + news services, rooted wherever the composer chose. */
  runtime: MarketsRuntime;
  /**
   * The Twelve Data key, read from the composer's vault on every call so a key
   * set in Settings applies without a restart. `null` when unset *or when the
   * vault refuses this app* (Money without a grant) — the stock handlers then
   * answer {@link StockApiKeyMissingError}'s message.
   */
  twelveDataKey: () => Promise<string | null>;
  /**
   * Read-only brokerage and exchange accounts (Phase 113 Theme P slice 2). Built by the composer over
   * its vault, so a credential is written and read in main only; absent, every account channel
   * answers that accounts are unavailable here instead of throwing.
   */
  accounts?: AccountsService;
  /** The provider transport; the real network by default, a fixture in tests. */
  fetcher?: Fetcher;
  /** Where a malformed payload is reported (desktop's logger); dropped when absent. */
  warn?: (issue: string) => void;
};

const asFailure = (err: unknown, fallback: string): GitOpResult<never> =>
  failure(err instanceof Error ? err.message : fallback);

const ok = <T,>(value: T) => ({ ok: true as const, value });

export const financeMain = defineFeatureMain<FinanceMainServices>({
  feature: financeManifest.feature,
  channels: financeManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { runtime: rt, accounts } = services;
    const fetcher = services.fetcher ?? defaultFetcher;
    const warn = (issue: string): GitOpResult<never> => {
      services.warn?.(issue);
      return failure(issue);
    };
    const providerFailure = (err: unknown): GitOpResult<never> => asFailure(err, 'finance request failed');
    const marketsFailure = (err: unknown): GitOpResult<never> => asFailure(err, 'market data request failed');

    ipc.handle(CHANNELS.financeSearch, schemas.FinanceSearchRequest, async (req) => {
      try {
        return ok(await searchFinanceAssets(req.kind, req.query, await services.twelveDataKey(), fetcher));
      } catch (err) {
        return providerFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.financeQuote, schemas.FinanceQuoteRequest, async (req) => {
      try {
        return ok(await getFinanceQuote(req.kind, req.symbol, await services.twelveDataKey(), fetcher));
      } catch (err) {
        return providerFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.financeHistory, schemas.FinanceHistoryRequest, async (req) => {
      try {
        return ok(await getFinanceHistory(req.kind, req.symbol, await services.twelveDataKey(), fetcher));
      } catch (err) {
        return providerFailure(err);
      }
    }, warn);

    const NO_ACCOUNTS = 'Brokerage accounts are not available in this app.';
    const accountsFailure = (err: unknown): GitOpResult<never> => asFailure(err, 'account request failed');

    ipc.handleBare(CHANNELS.financeAccountsList, async () => {
      if (!accounts) return failure(NO_ACCOUNTS);
      try {
        return ok(await accounts.list());
      } catch (err) {
        return accountsFailure(err);
      }
    });

    ipc.handle(CHANNELS.financeAccountTest, schemas.FinanceAccountTestRequest, async (req) => {
      if (!accounts) return failure(NO_ACCOUNTS);
      try {
        return ok({ summary: await accounts.test(req) });
      } catch (err) {
        return accountsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.financeAccountAdd, schemas.FinanceAccountAddRequest, async (req) => {
      if (!accounts) return failure(NO_ACCOUNTS);
      try {
        return ok({ account: await accounts.add(req) });
      } catch (err) {
        return accountsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.financeAccountRemove, schemas.FinanceAccountRemoveRequest, async (req) => {
      if (!accounts) return failure(NO_ACCOUNTS);
      try {
        return ok({ removed: await accounts.remove(req.id) });
      } catch (err) {
        return accountsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.financeAccountSnapshots, schemas.FinanceAccountSnapshotsRequest, async (req) => {
      if (!accounts) return failure(NO_ACCOUNTS);
      try {
        const snapshots = await accounts.snapshots(req);
        const byAccount = allocationByAccount(snapshots.map((s) => ({ label: s.account.label, totalUsd: s.totalUsd })));
        return ok({ snapshots, byAccount });
      } catch (err) {
        return accountsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.marketsSeries, schemas.MarketsSeriesRequest, async (req) => {
      try {
        return ok({ series: await rt.markets.getSeriesBatch(req.assets, req.timescale, req.refresh === true) });
      } catch (err) {
        return marketsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.marketsQuotes, schemas.MarketsQuotesRequest, async (req) => {
      try {
        return ok({ quotes: await rt.markets.getQuoteBatch(req.assets, req.refresh === true) });
      } catch (err) {
        return marketsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.marketsSearch, schemas.MarketsSearchRequest, async (req) => {
      try {
        return ok(await rt.markets.search(req.query));
      } catch (err) {
        return marketsFailure(err);
      }
    }, warn);

    ipc.handleBare(CHANNELS.marketsRates, async () => {
      try {
        return ok(await rt.markets.getRates());
      } catch (err) {
        return marketsFailure(err);
      }
    });

    ipc.handleBare(CHANNELS.marketsPortfolioGet, async () => {
      try {
        return ok(await rt.portfolio.get());
      } catch (err) {
        return marketsFailure(err);
      }
    });

    ipc.handle(CHANNELS.marketsPortfolioApply, schemas.MarketsPortfolioOpRequest, async (op) => {
      try {
        const result = await rt.portfolio.apply(op);
        return result.ok ? ok(result.value) : failure(result.message);
      } catch (err) {
        return marketsFailure(err);
      }
    }, warn);

    ipc.handle(CHANNELS.marketsNews, schemas.MarketsNewsRequest, async (req) => {
      try {
        return ok(await rt.news.getNews(req.sources, req.limit));
      } catch (err) {
        return marketsFailure(err);
      }
    }, warn);
  },
});

/**
 * Keeps the FX table fresh in the background — hourly, and never keeping the
 * process alive. A failed refresh is reported, not thrown: the cache still
 * serves. Returns what stops it. The composer starts it (it owns the process).
 */
export function startRatesRefresh(runtime: MarketsRuntime, onError?: (message: string) => void): () => void {
  const refresh = (): void => {
    runtime.markets.getRates().catch((err: unknown) => onError?.(`markets: rate refresh failed: ${String(err)}`));
  };
  refresh();
  const timer = setInterval(refresh, RATES_TTL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
