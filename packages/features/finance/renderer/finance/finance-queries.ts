import { useQuery } from '@tanstack/react-query';

import { getHistory, getQuote, searchAssets } from './finance-api';
import type { AssetKind, FinanceAsset } from './finance-types';

/**
 * Polling intervals, ported from the source app's widgets. The global default
 * (`app.tsx`) is `staleTime: Infinity`, which is wrong for live prices, so
 * every finance query sets its own `staleTime`/`refetchInterval` explicitly.
 */
const QUOTE_REFRESH_MS = 60_000;
const HISTORY_REFRESH_MS = 5 * 60_000;
const SEARCH_STALE_MS = 5 * 60_000;

export function useFinanceQuote(asset: FinanceAsset | null, twelveDataKeyConfigured: boolean) {
  const enabled = asset !== null && (asset.kind !== 'stock' || twelveDataKeyConfigured);
  return useQuery({
    queryKey: ['finance', 'quote', asset?.kind, asset?.symbol],
    queryFn: () => getQuote(asset!.kind, asset!.symbol),
    enabled,
    staleTime: QUOTE_REFRESH_MS,
    refetchInterval: QUOTE_REFRESH_MS,
  });
}

export function useFinanceHistory(asset: FinanceAsset | null, twelveDataKeyConfigured: boolean) {
  const enabled = asset !== null && (asset.kind !== 'stock' || twelveDataKeyConfigured);
  return useQuery({
    queryKey: ['finance', 'history', asset?.kind, asset?.symbol],
    queryFn: () => getHistory(asset!.kind, asset!.symbol),
    enabled,
    staleTime: HISTORY_REFRESH_MS,
    refetchInterval: HISTORY_REFRESH_MS,
  });
}

/** Debounced by the caller (`finance-panel.tsx`) via the `query` it passes in. */
export function useFinanceSearch(
  kind: AssetKind,
  query: string,
  twelveDataKeyConfigured: boolean,
) {
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2 && (kind !== 'stock' || twelveDataKeyConfigured);
  return useQuery({
    queryKey: ['finance', 'search', kind, trimmed],
    queryFn: () => searchAssets(kind, trimmed),
    enabled,
    staleTime: SEARCH_STALE_MS,
  });
}
