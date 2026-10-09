import { useMemo, useState } from 'react';

import { LuChartPie } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { AssetIcon } from './asset-icon';
import { allocation, portfolioValue } from './finance-math';
import { formatPct } from './finance-format';
import { Donut, StaleHint } from './finance-parts';
import { useDisplayCurrency, usePortfolio, useQuotes } from './use-markets';

/**
 * The portfolio as a donut, one arc per holding in its brand colour — plus
 * cash as a neutral arc, because money sitting on a card is part of what you
 * own. The total sits in the middle, in the display currency; hovering a legend
 * row (or an arc) lifts the matching slice.
 */
export function AllocationWidget() {
  const { data: portfolio, isLoading } = usePortfolio();
  const { rates, fromUsd } = useDisplayCurrency();
  const [includeCash, setIncludeCash] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  const held = useMemo(
    () => (portfolio?.holdings ?? []).map(({ symbol, name, kind }) => ({ symbol, name, kind })),
    [portfolio?.holdings],
  );
  const quotes = useQuotes(held);

  const slices = useMemo(
    () => (portfolio ? allocation(portfolio, quotes.data, rates, includeCash) : []),
    [portfolio, quotes.data, rates, includeCash],
  );
  const value = useMemo(() => (portfolio ? portfolioValue(portfolio, quotes.data, rates) : null), [portfolio, quotes.data, rates]);
  const stale = Object.values(quotes.data ?? {}).some((q) => q.stale);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!portfolio || !value) {
    return <EmptyState icon={LuChartPie} title="Allocation unavailable" body="The simulated portfolio could not be read." />;
  }
  if (slices.length === 0) {
    return (
      <EmptyState
        icon={LuChartPie}
        title="Nothing to allocate"
        body={includeCash ? 'Deposit some cash or buy an asset.' : 'You hold no priced assets yet.'}
      />
    );
  }

  const drawn = slices.reduce((sum, s) => sum + s.valueUsd, 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeCash}
            onChange={(event) => setIncludeCash(event.target.checked)}
            className="size-3.5 accent-[hsl(var(--primary))]"
          />
          Include cash
        </label>
        <StaleHint stale={stale} fetchedAt={null} />
      </div>

      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-4 overflow-auto">
        <Donut slices={slices} size={148} thickness={17} activeId={active} onActive={setActive}>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
          <span data-testid="allocation-total" className="max-w-[100px] truncate text-base font-semibold tabular-nums">
            {fromUsd(drawn, { compact: drawn >= 1_000_000 })}
          </span>
          {value.unpriced.length > 0 ? (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">{value.unpriced.length} unpriced</span>
          ) : null}
        </Donut>

        <ul aria-label="Allocation legend" className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-xs">
          {slices.map((slice) => (
            <li
              key={slice.id}
              data-legend={slice.id}
              onMouseEnter={() => setActive(slice.id)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-2 rounded px-1.5 py-1 transition-colors ${active === slice.id ? 'bg-accent' : ''}`}
            >
              {slice.kind === 'asset' ? (
                <AssetIcon symbol={slice.id} size={18} />
              ) : (
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              )}
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="shrink-0 text-right leading-tight">
                <span className="block tabular-nums">{fromUsd(slice.valueUsd)}</span>
                <span className="block text-[10px] tabular-nums text-muted-foreground">{formatPct(slice.share * 100, 1)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
