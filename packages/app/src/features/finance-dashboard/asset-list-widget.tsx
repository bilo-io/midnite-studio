import { useMemo } from 'react';

import { LuArrowDown, LuArrowUp, LuStar } from 'react-icons/lu';

import { MARKET_TIMESCALE_LABEL, usdToCurrency, type MarketAsset } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { AssetIcon } from './asset-icon';
import { formatMoney } from './finance-format';
import { SORT_LABELS, sortRows, type AssetRow, type SortKey } from './finance-math';
import { ChangeBadge, Sparkline, StaleHint, TONE_TEXT } from './finance-parts';
import { useFinanceUiStore, type ListId } from './finance-ui-store';
import { useAssetRows } from './use-asset-rows';
import { useDisplayCurrency, useKnownAssets, usePortfolio, usePortfolioOp } from './use-markets';

/**
 * The one asset-list component, used twice: **Watchlist** (what you watch) and
 * **Markets** (every other known asset). Same rows, same sorting, same star —
 * only the filter differs, which is why it is one component with a `list`
 * prop and not two near-copies drifting apart.
 *
 * Sortable by name, price, value (the size of your position), absolute gain and
 * percentage gain, over the global timescale. A row with no value for the
 * chosen key (an unpriced asset, one you do not hold) always sorts last — see
 * `sortRows`. Each row carries an inline area chart; the star watches or
 * unwatches, which moves the row between the two cards.
 */
const SORT_KEYS: SortKey[] = ['name', 'price', 'value', 'gain', 'gainPct'];

export function AssetListWidget({ list }: { list: ListId }) {
  const { data: portfolio, isLoading } = usePortfolio();
  const known = useKnownAssets(portfolio);
  const sort = useFinanceUiStore((s) => s.sorts[list]);
  const sortBy = useFinanceUiStore((s) => s.sortBy);
  const timescale = useFinanceUiStore((s) => s.timescale);
  const setChartAsset = useFinanceUiStore((s) => s.setChartAsset);
  const { currency, rates, fromUsd } = useDisplayCurrency();
  const { apply } = usePortfolioOp();

  const watched = useMemo(() => new Set(portfolio?.watchlist ?? []), [portfolio?.watchlist]);
  const assets = useMemo(
    () => known.filter((asset) => (list === 'watchlist' ? watched.has(asset.symbol) : !watched.has(asset.symbol))),
    [known, watched, list],
  );

  const { rows, loading, stale, fetchedAt, failed, error } = useAssetRows(assets, portfolio);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort.key, sort.dir]);
  const rate = usdToCurrency(1, currency, rates);

  if (isLoading || loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={LuStar}
        title={list === 'watchlist' ? 'Nothing watched' : 'Every known asset is on your watchlist'}
        body={
          list === 'watchlist'
            ? 'Star an asset in Markets, or search for one in the chart card.'
            : 'Unstar something on the watchlist and it will appear here.'
        }
      />
    );
  }

  const toggleWatch = (asset: MarketAsset): void => {
    void apply({ op: 'watch', asset, watched: !watched.has(asset.symbol) });
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={`Sort the ${list}`}>
        {SORT_KEYS.map((key) => {
          const active = sort.key === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              data-sort={key}
              aria-label={`Sort by ${SORT_LABELS[key]}${active ? `, ${sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
              onClick={() => sortBy(list, key)}
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {SORT_LABELS[key]}
              {active ? sort.dir === 'asc' ? <LuArrowUp aria-hidden className="size-3" /> : <LuArrowDown aria-hidden className="size-3" /> : null}
            </button>
          );
        })}
        <span className="ml-auto">
          <StaleHint stale={stale} fetchedAt={fetchedAt} />
        </span>
      </div>

      {failed ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          Market data is unavailable{error ? ` — ${error}` : ''}.
        </p>
      ) : null}

      <ul aria-label={list === 'watchlist' ? 'Watchlist assets' : 'Market assets'} className="flex flex-col divide-y divide-border/60">
        {sorted.map((row) => (
          <AssetListRow
            key={row.asset.symbol}
            row={row}
            watched={watched.has(row.asset.symbol)}
            currency={currency}
            rate={rate}
            fromUsd={fromUsd}
            windowLabel={MARKET_TIMESCALE_LABEL[timescale]}
            onToggleWatch={() => toggleWatch(row.asset)}
            onSelect={() => setChartAsset(row.asset)}
          />
        ))}
      </ul>
    </div>
  );
}

function AssetListRow({
  row,
  watched,
  currency,
  rate,
  fromUsd,
  windowLabel,
  onToggleWatch,
  onSelect,
}: {
  row: AssetRow;
  watched: boolean;
  currency: string;
  rate: number;
  fromUsd: (usd: number | null) => string;
  windowLabel: string;
  onToggleWatch: () => void;
  onSelect: () => void;
}) {
  const { asset, change } = row;
  const direction = change?.direction ?? 'flat';
  return (
    <li data-row={asset.symbol} className="group flex items-center gap-2 py-1.5">
      <button
        type="button"
        aria-pressed={watched}
        aria-label={`${watched ? 'Unwatch' : 'Watch'} ${asset.name}`}
        onClick={onToggleWatch}
        className={`shrink-0 rounded p-1 transition-colors hover:bg-accent ${watched ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-foreground'}`}
      >
        <LuStar aria-hidden className={`size-4 ${watched ? 'fill-current' : ''}`} />
      </button>

      <button
        type="button"
        onClick={onSelect}
        aria-label={`Show ${asset.name} on the chart`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left"
      >
        <AssetIcon symbol={asset.symbol} size={28} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-medium">{asset.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {asset.symbol}
            {row.valueUsd !== null ? ` · ${fromUsd(row.valueUsd)}` : ''}
          </span>
        </span>
      </button>

      <Sparkline
        values={row.spark}
        direction={direction}
        area
        width={64}
        height={26}
        label={`${asset.symbol} over the ${windowLabel}`}
      />

      <div className="w-[7.25rem] shrink-0 text-right leading-tight">
        <p className="truncate text-[13px] tabular-nums">{row.priceUsd === null ? '—' : fromUsd(row.priceUsd)}</p>
        {change ? (
          <p className={`truncate text-[11px] tabular-nums ${TONE_TEXT[direction]}`} title={`Over the ${windowLabel}`}>
            <ChangeBadge
              direction={direction}
              pct={change.pct}
              abs={`${change.abs >= 0 ? '+' : '−'}${formatMoney(Math.abs(change.abs * rate), currency, { compact: Math.abs(change.abs * rate) >= 100_000 })}`}
            />
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{row.error ? 'no data' : '…'}</p>
        )}
      </div>
    </li>
  );
}
