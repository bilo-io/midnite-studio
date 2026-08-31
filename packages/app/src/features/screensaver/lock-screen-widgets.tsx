import { useEffect, useState } from 'react';
import { LuActivity, LuArrowDown, LuArrowUp, LuTrendingUp } from 'react-icons/lu';
import { type MetricId } from '@midnite/studio-shared';

import { useMetricsStore } from '../../store/metrics-store';
import { METRIC_LABELS, metricColor, metricFill } from '../monitor/metric-palette';
import { MetricChart } from '../monitor/metric-chart';
import { useFinanceStore } from '../finance/finance-store';
import { useFinanceHistory, useFinanceQuote } from '../finance/finance-queries';
import { assetTicker, fmtPct, fmtPrice, historyChange } from '../finance/finance-derive';
import { Sparkline } from '../finance/sparkline';
import { useTitleTypewriter } from '../slides/use-title-typewriter';

const LOCK_CHART_GEOMETRY = {
  width: 140,
  height: 38,
  strokeWidth: 1.5,
  padTop: 3,
  areaAlpha: 0.25,
};

export function LockScreenWidgets() {
  return (
    <div
      data-testid="lock-screen-widgets"
      className="absolute inset-0 pointer-events-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto absolute bottom-8 left-8 z-10">
        <LockScreenFintechWidget />
      </div>
      <div className="pointer-events-auto absolute bottom-8 right-8 z-10">
        <LockScreenSysmonWidget />
      </div>
    </div>
  );
}

export function LockScreenSysmonWidget() {
  const series = useMetricsStore((s) => s.series);
  const latest = useMetricsStore((s) => s.latest);

  const activeMetricIds: MetricId[] = ['cpu', 'memory', 'gpu'];

  return (
    <div
      data-testid="lock-sysmon-widget"
      className="flex min-w-[280px] flex-col rounded-xl border border-transparent bg-transparent p-3.5 text-left transition-all sm:w-[320px]"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <LuActivity className="h-3.5 w-3.5 text-primary" />
          <span>System Monitor</span>
        </div>
        {latest?.cpuInfo?.cores ? (
          <span className="text-[10px] tabular-nums text-muted-foreground/80">
            {latest.cpuInfo.cores} cores
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {activeMetricIds.map((id) => {
          const points = series[id] ?? [];
          const val = latest?.[id] ?? (points.length > 0 ? points[points.length - 1]?.value : null);
          const color = metricColor(id);
          const fill = metricFill(id, 0.2);

          return (
            <div
              key={id}
              className="flex flex-col rounded-lg border border-transparent bg-transparent p-2"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-medium text-foreground/80">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  {METRIC_LABELS[id]}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {val != null ? `${Math.round(val)}%` : '—'}
                </span>
              </div>

              <div className="mt-1.5 h-9 w-full overflow-hidden rounded">
                {points.length > 1 ? (
                  <MetricChart
                    label={`${METRIC_LABELS[id]} graph`}
                    series={[{ id, points }]}
                    geometry={LOCK_CHART_GEOMETRY}
                    showBreaks={false}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/60"
                    style={{ background: fill }}
                  >
                    {val != null ? `${Math.round(val)}%` : 'Active'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LockScreenFintechWidget() {
  const assets = useFinanceStore((s) => s.assets);
  const apiKey = useFinanceStore((s) => s.twelveDataApiKey);
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    if (assets.length <= 1) {
      setTickerIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % assets.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [assets.length]);

  const activeIndex = assets.length > 0 ? tickerIndex % assets.length : 0;
  const currentAsset = assets[activeIndex] ?? null;

  const { data: quote } = useFinanceQuote(currentAsset, apiKey);
  const { data: history } = useFinanceHistory(currentAsset, apiKey);
  const { pct, up } = historyChange(history ?? []);
  const price = quote?.price ?? history?.at(-1)?.c;

  const rawTicker = currentAsset ? assetTicker(currentAsset) : '';
  const { typed: typedTicker } = useTitleTypewriter(rawTicker, false);

  const hasData = currentAsset !== null && price != null;
  const colorClass = hasData
    ? up
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-destructive'
    : 'text-foreground';
  const subtleColorClass = hasData
    ? up
      ? 'text-emerald-600/70 dark:text-emerald-400/70'
      : 'text-destructive/70'
    : 'text-muted-foreground';

  return (
    <div
      data-testid="lock-fintech-widget"
      className="flex min-w-[280px] flex-col justify-between rounded-xl border border-transparent bg-transparent p-3.5 text-left transition-all sm:w-[320px]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <LuTrendingUp className="h-3.5 w-3.5 text-primary" />
          <span>Fintech Cycle</span>
        </div>
        {assets.length > 1 ? (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">
              {activeIndex + 1}/{assets.length}
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          </div>
        ) : null}
      </div>

      {hasData ? (
        <div className="my-2 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className={`font-mono text-lg font-bold tracking-tight ${colorClass}`}>
                {typedTicker || rawTicker}
              </span>
              <span className={`text-xs ${subtleColorClass}`}>
                {currentAsset.name || currentAsset.symbol}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-semibold tabular-nums ${colorClass}`}>
                {fmtPrice(price, quote?.currency)}
              </span>
              {pct != null ? (
                <span className={`flex items-center text-xs font-medium tabular-nums ${colorClass}`}>
                  {up ? (
                    <LuArrowUp className="h-3 w-3 shrink-0 stroke-[2.5]" />
                  ) : (
                    <LuArrowDown className="h-3 w-3 shrink-0 stroke-[2.5]" />
                  )}
                  {fmtPct(pct)}
                </span>
              ) : null}
            </div>
          </div>

          {history && history.length >= 2 ? (
            <div className={`shrink-0 ${colorClass}`}>
              <Sparkline points={history} up={up} width={76} height={28} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="my-3 flex flex-col items-center justify-center py-1 text-xs text-muted-foreground">
          <span>{currentAsset ? 'Loading market data…' : 'No watchlisted assets'}</span>
        </div>
      )}

      {assets.length > 1 ? (
        <div className="flex items-center justify-center gap-1 pt-1">
          {assets.map((a, idx) => (
            <span
              key={`${a.symbol}-${idx}`}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === activeIndex
                  ? 'w-4 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
