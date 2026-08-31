import { useState } from 'react';

import { LuArrowDown, LuArrowUp, LuChartLine } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import { fmtPrice, historyChange } from './finance-derive';
import { useFinanceHistory, useFinanceQuote } from './finance-queries';
import { FinancePanel } from './finance-panel';
import { useFinanceStore } from './finance-store';

/**
 * The status bar's finance footer: an icon plus the first watched ticker's
 * live price and gain/loss arrow, opening the full watchlist (`FinancePanel`)
 * on click — same click-to-panel shape as `AssistantMenu`.
 */
export function FinanceSegment() {
  const [open, setOpen] = useState(false);
  const assets = useFinanceStore((s) => s.assets);
  const apiKey = useFinanceStore((s) => s.twelveDataApiKey);
  const headline = assets[0] ?? null;

  const { data: quote } = useFinanceQuote(headline, apiKey);
  const { data: history } = useFinanceHistory(headline, apiKey);
  const { pct, up } = historyChange(history ?? []);
  const price = quote?.price ?? history?.at(-1)?.c;

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
        <span className="flex items-center gap-1.5">
          <LuChartLine aria-hidden className="h-3.5 w-3.5" />
          {headline && price != null ? (
            <span className="flex items-center gap-1 tabular-nums">
              <span className="status-label">{fmtPrice(price, quote?.currency)}</span>
              {pct != null &&
                (up ? (
                  <LuArrowUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <LuArrowDown className="h-3 w-3 text-destructive" aria-hidden />
                ))}
            </span>
          ) : (
            <span className="status-label">Finance</span>
          )}
        </span>
      }
    >
      <FinancePanel />
    </Popover>
  );
}
