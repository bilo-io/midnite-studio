import { useCallback, useMemo } from 'react';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  MARKET_CATALOGUE,
  usdToCurrency,
  type GitOpResult,
  type MarketAsset,
  type MarketNewsItem,
  type MarketNewsSource,
  type MarketPortfolio,
  type MarketPortfolioOp,
  type MarketQuoteEntry,
  type MarketRates,
  type MarketSeriesEntry,
  type MarketTimescale,
} from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { formatUsd } from './finance-format';
import { useFinanceUiStore } from './finance-ui-store';

/**
 * Data hooks for the Finance dashboard. Every one reads through
 * `window.midniteStudio.markets` — the renderer never fetches a price itself —
 * and every one sets its own `staleTime`, because the app-wide default is
 * `Infinity`, which is exactly wrong for a quote.
 *
 * A failed envelope becomes a thrown `Error` inside the query function, which is
 * how react-query wants to hear about it; the *bridge* never throws, this is
 * only the renderer turning "not ok" into the library's own failure state.
 */

const MIN = 60_000;

const unwrap = async <T,>(call: Promise<GitOpResult<T>> | undefined, fallback: string): Promise<T> => {
  if (!call) throw new Error(fallback);
  const result = await call;
  if (!result.ok) throw new Error(result.kind === 'error' ? result.message : fallback);
  return (result as { value: T }).value;
};

/**
 * Whether this fetch should bypass main's cache freshness. True exactly once
 * per query per Refresh press: the nonce is part of the query key, so the
 * refetch it triggers is a new key, and the interval refetches that follow
 * reuse that key and must NOT keep forcing the network.
 */
const forced = new Set<string>();
const takeRefresh = (id: string, nonce: number): boolean => {
  if (nonce === 0 || forced.has(id)) return false;
  forced.add(id);
  return true;
};

const symbolsKey = (assets: readonly MarketAsset[]): string =>
  [...new Set(assets.map((a) => a.symbol))].sort().join(',');

export const FINANCE_KEYS = {
  portfolio: ['markets', 'portfolio'] as const,
  rates: ['markets', 'rates'] as const,
  all: ['markets'] as const,
};

// --- portfolio -----------------------------------------------------------------------

export function usePortfolio() {
  return useQuery<MarketPortfolio>({
    queryKey: FINANCE_KEYS.portfolio,
    queryFn: () => unwrap(bridge()?.markets.portfolio(), 'The portfolio is unavailable.'),
    staleTime: Infinity,
  });
}

export type PortfolioOutcome = { ok: true } | { ok: false; message: string };

/**
 * Apply one portfolio operation. Resolves with an outcome rather than
 * rejecting: a refused withdrawal is something the modal renders next to the
 * field, not an error state.
 */
export function usePortfolioOp() {
  const client = useQueryClient();
  const mutation = useMutation<PortfolioOutcome, Error, MarketPortfolioOp>({
    mutationFn: async (op) => {
      const call = bridge()?.markets.apply(op);
      if (!call) return { ok: false, message: 'The portfolio is unavailable.' };
      const result = await call;
      if (!result.ok) return { ok: false, message: result.kind === 'error' ? result.message : 'That change could not be applied.' };
      client.setQueryData(FINANCE_KEYS.portfolio, result.value);
      return { ok: true };
    },
  });
  return { apply: mutation.mutateAsync, pending: mutation.isPending };
}

// --- exchange rates ------------------------------------------------------------------------

const USD_ONLY: MarketRates = { USD: 1 };

export function useRates() {
  const query = useQuery({
    queryKey: FINANCE_KEYS.rates,
    queryFn: () => unwrap(bridge()?.markets.rates(), 'Exchange rates are unavailable.'),
    staleTime: 30 * MIN,
    refetchInterval: 60 * MIN,
  });
  return {
    rates: query.data?.rates ?? USD_ONLY,
    fetchedAt: query.data?.fetchedAt ?? null,
    stale: query.data?.stale ?? false,
    loaded: query.data !== undefined,
  };
}

// --- prices ---------------------------------------------------------------------------------------

export type SeriesMap = Record<string, MarketSeriesEntry>;

const SERIES_REFRESH: Record<MarketTimescale, number> = {
  '1D': MIN,
  '1W': 5 * MIN,
  '1M': 10 * MIN,
  '3M': 30 * MIN,
  '1Y': 30 * MIN,
  '5Y': 60 * MIN,
  ALL: 60 * MIN,
};

export function useSeries(assets: readonly MarketAsset[], timescale: MarketTimescale, enabled = true) {
  const nonce = useFinanceUiStore((s) => s.refreshNonce);
  const key = ['markets', 'series', timescale, symbolsKey(assets), nonce] as const;
  return useQuery<SeriesMap>({
    queryKey: key,
    queryFn: async () =>
      (
        await unwrap(
          bridge()?.markets.series({ assets: [...assets], timescale, refresh: takeRefresh(key.join('|'), nonce) }),
          'Market data is unavailable.',
        )
      ).series,
    enabled: enabled && assets.length > 0,
    staleTime: SERIES_REFRESH[timescale],
    refetchInterval: SERIES_REFRESH[timescale],
    // Switching timescale keeps the old sparklines on screen until the new ones land.
    placeholderData: keepPreviousData,
  });
}

export function useQuotes(assets: readonly MarketAsset[], enabled = true) {
  const nonce = useFinanceUiStore((s) => s.refreshNonce);
  const key = ['markets', 'quotes', symbolsKey(assets), nonce] as const;
  return useQuery<Record<string, MarketQuoteEntry>>({
    queryKey: key,
    queryFn: async () =>
      (
        await unwrap(
          bridge()?.markets.quotes({ assets: [...assets], refresh: takeRefresh(key.join('|'), nonce) }),
          'Prices are unavailable.',
        )
      ).quotes,
    enabled: enabled && assets.length > 0,
    staleTime: MIN,
    refetchInterval: MIN,
    placeholderData: keepPreviousData,
  });
}

export function useMarketSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<(MarketAsset & { exchange?: string | undefined })[]>({
    queryKey: ['markets', 'search', trimmed.toLowerCase()],
    queryFn: () => unwrap(bridge()?.markets.search({ query: trimmed }), 'Search is unavailable.'),
    enabled: trimmed.length >= 1,
    staleTime: 10 * MIN,
    placeholderData: keepPreviousData,
  });
}

export type NewsResult = { items: MarketNewsItem[]; stale: boolean; failed: string[] };

export function useNews(sources: readonly MarketNewsSource[]) {
  const key = sources.map((s) => (s.kind === 'feed' ? s.url : s.kind === 'keyword' ? `k:${s.query}` : `a:${s.symbol}`)).join('|');
  return useQuery<NewsResult>({
    queryKey: ['markets', 'news', key],
    queryFn: () => unwrap(bridge()?.markets.news({ sources: [...sources], limit: 60 }), 'News is unavailable.'),
    enabled: sources.length > 0,
    staleTime: 10 * MIN,
    refetchInterval: 15 * MIN,
    placeholderData: keepPreviousData,
  });
}

// --- derived ---------------------------------------------------------------------------------------

/** The catalogue plus anything the user added by search or holds that the catalogue lacks. */
export function useKnownAssets(portfolio: MarketPortfolio | undefined): MarketAsset[] {
  return useMemo(() => {
    const map = new Map<string, MarketAsset>(MARKET_CATALOGUE.map(({ symbol, name, kind }) => [symbol, { symbol, name, kind }]));
    for (const asset of portfolio?.extraAssets ?? []) if (!map.has(asset.symbol)) map.set(asset.symbol, asset);
    for (const holding of portfolio?.holdings ?? []) {
      if (!map.has(holding.symbol)) map.set(holding.symbol, { symbol: holding.symbol, name: holding.name, kind: holding.kind });
    }
    return [...map.values()];
  }, [portfolio]);
}

/** The display currency, its rate and a formatter — what nearly every card needs. */
export function useDisplayCurrency() {
  const currency = useFinanceUiStore((s) => s.currency);
  const { rates, stale, fetchedAt, loaded } = useRates();
  const rate = usdToCurrency(1, currency, rates);
  const fromUsd = useCallback(
    (usd: number | null, options: { compact?: boolean } = {}) => formatUsd(usd, currency, rates, options),
    [currency, rates],
  );
  return { currency, rates, rate, fromUsd, ratesStale: stale, ratesFetchedAt: fetchedAt, ratesLoaded: loaded };
}
