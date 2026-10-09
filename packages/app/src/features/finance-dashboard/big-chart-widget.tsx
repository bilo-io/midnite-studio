import { Suspense, lazy, useId, useMemo, useState } from 'react';

import { LuArrowLeftRight, LuChevronUp, LuRotateCw, LuSparkles, LuStar } from 'react-icons/lu';

import { MARKET_TIMESCALE_LABEL, MARKET_TIMESCALE_MS, type MarketAsset } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { ExternalLink } from '../markdown/external-link';
import { AssetIcon } from './asset-icon';
import { AssetSearch } from './asset-search';
import { formatMoney } from './finance-format';
import { scaleCandles, seriesChange } from './finance-math';
import { ChangeBadge, Segmented, StaleHint } from './finance-parts';
import { CHART_TYPES, useFinanceUiStore } from './finance-ui-store';
import type { HoverBar } from './price-chart';
import { describeSummary, summarizeSeries } from './series-summary';
import { SummaryHeadline, SummaryLines } from './summary-view';
import { TradeModal } from './trade-modal';
import { useDisplayCurrency, useKnownAssets, usePortfolio, usePortfolioOp, useQuotes, useSeries } from './use-markets';

/**
 * Lazy: `lightweight-charts` lives behind this import and nowhere else, so the
 * library is its own chunk, fetched the first time a board with a chart on it
 * is shown (see `price-chart.tsx`).
 */
const PriceChart = lazy(() => import('./price-chart'));

const DEFAULT_ASSET: MarketAsset = { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto' };

/**
 * The big chart: search any stock, ETF or coin; pick candles, line, area, %
 * change or OHLC bars; read a plain-language summary of exactly the window on
 * screen; buy or sell it against one of your cards.
 *
 * **Insights** (the rainbow button, top right) is the one control whose purpose
 * was not specified; it expands the short summary into the full breakdown — the
 * same deterministic arithmetic with the numbers behind it shown.
 */
export function BigChartWidget() {
  const { data: portfolio } = usePortfolio();
  const known = useKnownAssets(portfolio);
  const timescale = useFinanceUiStore((s) => s.timescale);
  const chartType = useFinanceUiStore((s) => s.chartType);
  const setChartType = useFinanceUiStore((s) => s.setChartType);
  const chartAsset = useFinanceUiStore((s) => s.chartAsset);
  const setChartAsset = useFinanceUiStore((s) => s.setChartAsset);
  const { currency, rate } = useDisplayCurrency();
  const { apply } = usePortfolioOp();

  const [insightsOpen, setInsightsOpen] = useState(false);
  const [trading, setTrading] = useState(false);
  const [hover, setHover] = useState<HoverBar>(null);
  const insightsId = useId();

  const asset = useMemo<MarketAsset>(() => {
    if (chartAsset) return chartAsset;
    const watched = new Set(portfolio?.watchlist ?? []);
    return known.find((a) => watched.has(a.symbol)) ?? DEFAULT_ASSET;
  }, [chartAsset, known, portfolio?.watchlist]);

  const assets = useMemo(() => [asset], [asset]);
  const series = useSeries(assets, timescale);
  const quotes = useQuotes(assets);
  const entry = series.data?.[asset.symbol];
  const candles = useMemo(() => scaleCandles(entry?.candles ?? [], rate), [entry?.candles, rate]);
  const change = useMemo(() => seriesChange(candles), [candles]);
  const priceUsd = quotes.data?.[asset.symbol]?.price ?? null;
  const price = priceUsd === null ? (change?.last ?? null) : priceUsd * rate;

  const suggestions = useMemo(() => {
    const held = new Set((portfolio?.holdings ?? []).map((h) => h.symbol));
    const watched = new Set(portfolio?.watchlist ?? []);
    return known.filter((a) => watched.has(a.symbol) || held.has(a.symbol));
  }, [known, portfolio]);

  const described = useMemo(() => {
    const spanMs = MARKET_TIMESCALE_MS[timescale];
    const intraday = spanMs !== null && spanMs <= 7 * 86_400_000;
    return describeSummary(summarizeSeries(candles), {
      money: (value) => formatMoney(value, currency),
      timeframe: MARKET_TIMESCALE_LABEL[timescale],
      date: (t) =>
        new Date(t).toLocaleString(
          undefined,
          intraday
            ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { month: 'short', day: 'numeric', year: spanMs === null || spanMs > 400 * 86_400_000 ? 'numeric' : undefined },
        ),
    });
  }, [candles, currency, timescale]);

  const watched = portfolio?.watchlist.includes(asset.symbol) ?? false;
  const intraday = (MARKET_TIMESCALE_MS[timescale] ?? Infinity) <= 7 * 86_400_000;
  const direction = change?.direction ?? 'flat';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <AssetSearch suggestions={suggestions} onSelect={setChartAsset} />
        <Segmented
          label="Chart type"
          size="sm"
          value={chartType}
          options={CHART_TYPES}
          onChange={setChartType}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={!portfolio}
            onClick={() => setTrading(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <LuArrowLeftRight aria-hidden className="size-3.5" />
            Trade
          </button>
          <button
            type="button"
            aria-expanded={insightsOpen}
            aria-controls={insightsOpen ? insightsId : undefined}
            onClick={() => setInsightsOpen((open) => !open)}
            className="rainbow-btn inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold"
          >
            <LuSparkles aria-hidden className="size-3.5" />
            Insights
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <AssetIcon symbol={asset.symbol} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <h4 className="truncate text-sm font-semibold">
            {asset.name} <span className="font-normal text-muted-foreground">{asset.symbol}</span>
          </h4>
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span data-testid="chart-price" className="text-base font-semibold tabular-nums">
              {price === null ? '—' : formatMoney(price, currency)}
            </span>
            {change ? (
              <ChangeBadge
                direction={direction}
                pct={change.pct}
                abs={`${change.abs >= 0 ? '+' : '−'}${formatMoney(Math.abs(change.abs), currency)}`}
              />
            ) : null}
            <span className="text-muted-foreground">{MARKET_TIMESCALE_LABEL[timescale]}</span>
            <StaleHint stale={entry?.stale ?? false} fetchedAt={entry?.fetchedAt ?? null} />
          </p>
        </div>
        <button
          type="button"
          aria-pressed={watched}
          aria-label={`${watched ? 'Unwatch' : 'Watch'} ${asset.name}`}
          onClick={() => void apply({ op: 'watch', asset, watched: !watched })}
          className={`rounded p-1.5 transition-colors hover:bg-accent ${watched ? 'text-amber-500' : 'text-muted-foreground'}`}
        >
          <LuStar aria-hidden className={`size-4 ${watched ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-md border border-border/60">
        {series.isPending ? (
          <Skeleton className="size-full rounded-none" />
        ) : series.isError || entry?.error || candles.length === 0 ? (
          <div className="flex size-full flex-col items-center justify-center gap-2">
            <EmptyState
              title="No chart data"
              body={entry?.error ?? (series.error instanceof Error ? series.error.message : `Nothing came back for ${asset.symbol}.`)}
              action={
                <button
                  type="button"
                  onClick={() => void series.refetch()}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
                >
                  <LuRotateCw aria-hidden className="size-3" />
                  Retry
                </button>
              }
            />
          </div>
        ) : (
          <>
            <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
              <PriceChart candles={candles} type={chartType} up={direction !== 'down'} intraday={intraday} onHover={setHover} />
            </Suspense>
            {hover ? (
              <p
                data-testid="chart-legend"
                className="pointer-events-none absolute left-2 top-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground backdrop-blur"
              >
                O {formatMoney(hover.o, currency)} · H {formatMoney(hover.h, currency)} · L {formatMoney(hover.l, currency)} · C{' '}
                {formatMoney(hover.c, currency)}
              </p>
            ) : null}
          </>
        )}
      </div>

      <section aria-label="Summary" className="flex shrink-0 flex-col gap-2 rounded-md bg-muted/40 p-2.5">
        <SummaryHeadline summary={described} />
        {described.lines.length > 0 ? <SummaryLines lines={described.lines} columns={2} /> : null}
      </section>

      {insightsOpen ? (
        <div
          id={insightsId}
          role="region"
          aria-label="Insights"
          className="flex shrink-0 flex-col gap-2 rounded-md border border-border bg-card p-2.5"
        >
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold">
              <LuSparkles aria-hidden className="size-3.5" />
              Insights — {asset.symbol}, {MARKET_TIMESCALE_LABEL[timescale]}
            </h4>
            <button
              type="button"
              aria-label="Collapse insights"
              onClick={() => setInsightsOpen(false)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LuChevronUp aria-hidden className="size-4" />
            </button>
          </div>
          {described.insights.length > 0 ? (
            <SummaryLines lines={described.insights} columns={2} />
          ) : (
            <p className="text-xs text-muted-foreground">Not enough data in this timeframe to break down.</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Worked out from the bars in this timeframe alone — a description of what happened, not a forecast, and no AI.
          </p>
        </div>
      ) : null}

      <p className="shrink-0 text-[10px] leading-snug text-muted-foreground">
        Charts by{' '}
        <ExternalLink href="https://www.tradingview.com/" className="!decoration-muted-foreground/40 !text-muted-foreground">
          TradingView Lightweight Charts™
        </ExternalLink>{' '}
        · © TradingView, Inc. · Apache-2.0. Prices come from public sources and may be delayed.
      </p>

      {portfolio ? (
        <TradeModal open={trading} asset={asset} priceUsd={priceUsd} portfolio={portfolio} onClose={() => setTrading(false)} />
      ) : null}
    </div>
  );
}
