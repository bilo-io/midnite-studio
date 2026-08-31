import { useEffect, useState } from 'react';

import { LuArrowDown, LuArrowUp, LuChartLine } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import { useTitleTypewriter } from '../slides/use-title-typewriter';
import { assetTicker, fmtPct, fmtPrice, historyChange } from './finance-derive';
import { useFinanceHistory, useFinanceQuote } from './finance-queries';
import { FinancePanel } from './finance-panel';
import { useFinanceStore } from './finance-store';
import { Sparkline } from './sparkline';

/**
 * The status bar's finance footer: displays the active ticker's symbol
 * (typed out with typewriter animation), live price, gain/loss arrow, and sparkline
 * chart, with the entire entry highlighted in green/red, cycling across all
 * watched tickers every 5 seconds, opening the full watchlist (`FinancePanel`) on click.
 */
export function FinanceSegment() {
  const [open, setOpen] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const assets = useFinanceStore((s) => s.assets);
  const apiKey = useFinanceStore((s) => s.twelveDataApiKey);

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

  const hasData = currentAsset !== null && price != null;
  const rawTicker = currentAsset ? assetTicker(currentAsset) : '';
  const rawPrice = hasData ? fmtPrice(price, quote?.currency) : '';
  const rawPct = pct != null ? fmtPct(pct) : '';

  const { typed: typedTicker } = useTitleTypewriter(rawTicker, false);
  const { typed: typedPrice } = useTitleTypewriter(rawPrice, false);
  const { typed: typedPct } = useTitleTypewriter(rawPct, false);

  const colorClass = hasData
    ? up
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-destructive'
    : '';

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label="Finance"
      testId="finance-segment"
      panelClassName="w-[400px] max-h-[420px] p-3"
      trigger={
        <span className={`flex items-center gap-1.5 transition-colors ${colorClass}`}>
          {hasData ? (
            <span className="flex items-center gap-1 tabular-nums">
              <span className="font-bold uppercase">{typedTicker || rawTicker}</span>
              <span className="status-label">{typedPrice || rawPrice}</span>
              {pct != null && (
                <span className="flex items-center gap-0.5 font-medium">
                  {up ? (
                    <LuArrowUp className="h-3 w-3 shrink-0 stroke-[2.5]" aria-hidden />
                  ) : (
                    <LuArrowDown className="h-3 w-3 shrink-0 stroke-[2.5]" aria-hidden />
                  )}
                  <span>{typedPct || rawPct}</span>
                </span>
              )}
            </span>
          ) : (
            <>
              <LuChartLine aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="status-label">Finance</span>
            </>
          )}
          {currentAsset && history && history.length >= 2 ? (
            <Sparkline points={history} up={up} width={36} height={14} />
          ) : null}
        </span>
      }
    >
      <FinancePanel />
    </Popover>
  );
}


