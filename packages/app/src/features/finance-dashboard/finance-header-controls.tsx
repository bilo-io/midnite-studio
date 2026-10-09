import { LuRefreshCw } from 'react-icons/lu';

import { MARKET_CURRENCIES, MARKET_TIMESCALES, type MarketTimescale } from '@midnite/studio-shared';
import { useIsFetching } from '@tanstack/react-query';

import { IconButton } from '../../components/icon-button';
import { formatAge } from './finance-format';
import { Segmented, StaleHint } from './finance-parts';
import { useFinanceUiStore } from './finance-ui-store';
import { useDisplayCurrency } from './use-markets';

/**
 * The dashboard-level controls for every Finance card: the **global timescale**
 * and the **display currency**.
 *
 * They live in the dashboard's header rather than inside any one card because
 * each of them drives all of the cards at once — change the timescale and every
 * sparkline, the chart, the list gains and the summary move together; change the
 * currency and every price, balance and total is re-denominated through the
 * exchange-rate table. Rendered whenever the board carries at least one Finance
 * card, so they are also there on a custom dashboard that borrowed one.
 */
const OPTIONS = MARKET_TIMESCALES.map((id) => ({ id, label: id }));

export function FinanceHeaderControls() {
  const timescale = useFinanceUiStore((s) => s.timescale);
  const setTimescale = useFinanceUiStore((s) => s.setTimescale);
  const currency = useFinanceUiStore((s) => s.currency);
  const setCurrency = useFinanceUiStore((s) => s.setCurrency);
  const refresh = useFinanceUiStore((s) => s.refresh);
  const { ratesStale, ratesFetchedAt } = useDisplayCurrency();
  const fetching = useIsFetching({ queryKey: ['markets'] }) > 0;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="finance-controls">
      <Segmented<MarketTimescale> label="Timescale" value={timescale} options={OPTIONS} onChange={setTimescale} />

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="sr-only sm:not-sr-only">Currency</span>
        <select
          aria-label="Display currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          title={ratesFetchedAt ? `Exchange rates updated ${formatAge(ratesFetchedAt)}` : 'Exchange rates not loaded yet'}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs"
        >
          {MARKET_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </label>
      <StaleHint stale={ratesStale} fetchedAt={ratesFetchedAt} what="Exchange rates" />

      <IconButton icon={LuRefreshCw} label="Refresh market data" size="sm" busy={fetching} onClick={refresh} />
    </div>
  );
}
