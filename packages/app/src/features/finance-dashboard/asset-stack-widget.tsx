import { useMemo } from 'react';

import { LuCoins } from 'react-icons/lu';

import { MARKET_TIMESCALE_LABEL, assetColor, usdToCurrency } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { AssetIcon } from './asset-icon';
import { FanStack } from './fan-stack';
import { formatMoney, formatQuantity } from './finance-format';
import type { AssetRow } from './finance-math';
import { ChangeBadge, Sparkline, StaleHint, TONE_TEXT } from './finance-parts';
import { useFinanceUiStore } from './finance-ui-store';
import { useAssetRows } from './use-asset-rows';
import { useDisplayCurrency, usePortfolio } from './use-markets';

/**
 * One card per held asset, stacked and fanned like the bank cards.
 *
 * Each shows the official mark in its brand colour, the name and ticker, the
 * price in the display currency, a sparkline of the global timescale (green if
 * the window ended higher than it began, red if lower) and the position's gain
 * or loss over that window with a matching arrow — the arrow, the text and the
 * sparkline all take the same tone, so a glance reads one colour per card.
 */
const CARD_HEIGHT = 84;

export function AssetStackWidget() {
  const { data: portfolio, isLoading } = usePortfolio();
  const timescale = useFinanceUiStore((s) => s.timescale);
  const { currency, rates, fromUsd } = useDisplayCurrency();

  const held = useMemo(
    () =>
      (portfolio?.holdings ?? []).map(({ symbol, name, kind }) => ({ symbol, name, kind })),
    [portfolio?.holdings],
  );
  const { rows, loading, stale, fetchedAt, failed, error } = useAssetRows(held, portfolio);

  // Biggest position first — the front card is the one that matters most.
  const ordered = useMemo(
    () => [...rows].sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1)),
    [rows],
  );

  if (isLoading || loading) return <Skeleton className="h-24 w-full" />;
  if (held.length === 0) {
    return (
      <EmptyState
        icon={LuCoins}
        title="No assets yet"
        body="Buy something from the chart card and it will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {stale ? (
        <div className="flex justify-end">
          <StaleHint stale fetchedAt={fetchedAt} />
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          Market data is unavailable{error ? ` — ${error}` : ''}. Showing holdings without prices.
        </p>
      ) : null}
      <FanStack
        label="asset cards"
        items={ordered}
        keyOf={(row) => row.asset.symbol}
        cardHeight={CARD_HEIGHT}
        peek={26}
        renderCard={(row) => (
          <AssetCard row={row} currency={currency} rate={usdToCurrency(1, currency, rates)} fromUsd={fromUsd} timescale={timescale} />
        )}
      />
    </div>
  );
}

function AssetCard({
  row,
  currency,
  rate,
  fromUsd,
  timescale,
}: {
  row: AssetRow;
  currency: string;
  rate: number;
  fromUsd: (usd: number | null) => string;
  timescale: keyof typeof MARKET_TIMESCALE_LABEL;
}) {
  const { asset, change, priceUsd, quantity } = row;
  const direction = change?.direction ?? 'flat';
  // The position's gain over the window: units held × the per-unit move, in display currency.
  const positionGain = change ? quantity * change.abs * rate : null;

  return (
    <article
      aria-label={`${asset.name} card`}
      data-asset-card={asset.symbol}
      className="relative flex h-full cursor-pointer select-none items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3 shadow-sm"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: assetColor(asset.symbol) }} />
      <AssetIcon symbol={asset.symbol} size={36} />

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{asset.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {asset.symbol} · {formatQuantity(quantity)} held
        </p>
        <p className="mt-0.5 truncate text-xs tabular-nums">{priceUsd === null ? '—' : fromUsd(priceUsd)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Sparkline
          values={row.spark}
          direction={direction}
          width={84}
          height={28}
          label={`${asset.symbol} over the ${MARKET_TIMESCALE_LABEL[timescale]}`}
        />
        {change && positionGain !== null ? (
          <div className="text-right text-[11px] leading-tight">
            <ChangeBadge
              direction={direction}
              pct={change.pct}
              abs={`${positionGain >= 0 ? '+' : '−'}${formatMoney(Math.abs(positionGain), currency)}`}
            />
          </div>
        ) : (
          <span className={`text-[11px] ${TONE_TEXT.flat}`}>no data</span>
        )}
      </div>
    </article>
  );
}
