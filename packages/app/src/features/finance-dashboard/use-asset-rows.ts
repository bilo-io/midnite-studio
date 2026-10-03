import { useMemo } from 'react';

import type { MarketAsset, MarketPortfolio } from '@midnite/studio-shared';

import { closes, seriesChange, type AssetRow } from './finance-math';
import { useFinanceUiStore } from './finance-ui-store';
import { useQuotes, useSeries } from './use-markets';

/**
 * Everything a list or a card needs to draw an asset, for the global timescale:
 * its latest USD price, its change across the window, its sparkline, and what
 * the portfolio holds of it.
 *
 * Price and series are fetched separately on purpose. The price is always the
 * *current* one (the one-day series' last close), whatever timescale is picked —
 * so the portfolio's value does not wobble when you switch from 1D to 1Y — while
 * the series is just the shape of the window being looked at.
 */
export type AssetRows = {
  rows: AssetRow[];
  /** First load, nothing to show yet. */
  loading: boolean;
  /** Some row is being served from the last known cache. */
  stale: boolean;
  /** Oldest fetch time among the rows, for the stale hint. */
  fetchedAt: number | null;
  /** Every row failed and there is nothing cached. */
  failed: boolean;
  error: string | null;
};

export function useAssetRows(
  assets: readonly MarketAsset[],
  portfolio: MarketPortfolio | undefined,
  enabled = true,
): AssetRows {
  const timescale = useFinanceUiStore((s) => s.timescale);
  const series = useSeries(assets, timescale, enabled);
  const quotes = useQuotes(assets, enabled);

  return useMemo(() => {
    const held = new Map((portfolio?.holdings ?? []).map((h) => [h.symbol, h.quantity]));
    let stale = false;
    let fetchedAt: number | null = null;
    let errors = 0;

    const rows: AssetRow[] = assets.map((asset) => {
      const entry = series.data?.[asset.symbol];
      const quote = quotes.data?.[asset.symbol];
      const candles = entry?.candles ?? [];
      const change = seriesChange(candles);
      const priceUsd = quote?.price ?? change?.last ?? null;
      const quantity = held.get(asset.symbol) ?? 0;
      if (entry?.stale || quote?.stale) stale = true;
      if (entry?.fetchedAt != null) fetchedAt = fetchedAt === null ? entry.fetchedAt : Math.min(fetchedAt, entry.fetchedAt);
      if (entry?.error) errors += 1;
      return {
        asset,
        priceUsd,
        change,
        quantity,
        valueUsd: quantity > 0 && priceUsd !== null ? quantity * priceUsd : null,
        spark: closes(candles),
        stale: Boolean(entry?.stale || quote?.stale),
        error: entry?.error,
      };
    });

    return {
      rows,
      loading: enabled && assets.length > 0 && series.data === undefined && !series.isError,
      stale,
      fetchedAt,
      failed: assets.length > 0 && (series.isError || (series.data !== undefined && errors === assets.length)),
      error: series.error instanceof Error ? series.error.message : (rows.find((r) => r.error)?.error ?? null),
    };
  }, [assets, portfolio?.holdings, series.data, series.isError, series.error, quotes.data, enabled]);
}
