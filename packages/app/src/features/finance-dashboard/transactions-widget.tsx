import { useMemo, useState } from 'react';

import { LuArrowDown, LuArrowUp, LuCreditCard, LuReceipt, LuSearch } from 'react-icons/lu';

import { usdToCurrency, type MarketTransaction, type MarketTxType } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { Skeleton } from '../../components/skeleton';
import { AssetIcon } from './asset-icon';
import { formatMoney, formatQuantity } from './finance-format';
import {
  TX_TYPE_LABEL,
  filterTransactions,
  nextTxSort,
  signedValueUsd,
  sortTransactions,
  txAmount,
  txSubject,
  type TxSortDir,
  type TxSortKey,
} from './transactions-model';
import { useDisplayCurrency, usePortfolio } from './use-markets';

/**
 * The ledger: every deposit, withdrawal, buy and sell, newest first.
 *
 * Searchable (asset, ticker, type, currency, date) and sortable on every
 * column. Each trade wears its asset's mark in its brand colour; a cash
 * movement wears a card. Amounts and prices are displayed in the display
 * currency but stored in USD — the same rate table that prices everything else
 * converts them, so changing the currency re-denominates the whole history.
 */
const PAGE = 100;

const TYPE_STYLE: Record<MarketTxType, string> = {
  deposit: 'bg-success/15 text-success',
  withdraw: 'bg-destructive/15 text-destructive',
  buy: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  sell: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

const COLUMNS: { key: TxSortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'asset', label: 'Asset', align: 'left' },
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'type', label: 'Type', align: 'left' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'value', label: 'Value', align: 'right' },
];

export function TransactionsWidget() {
  const { data: portfolio, isLoading } = usePortfolio();
  const { currency, rates } = useDisplayCurrency();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: TxSortKey; dir: TxSortDir }>({ key: 'date', dir: 'desc' });
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () => sortTransactions(filterTransactions(portfolio?.transactions ?? [], query), sort.key, sort.dir),
    [portfolio?.transactions, query, sort.key, sort.dir],
  );

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if ((portfolio?.transactions.length ?? 0) === 0) {
    return <EmptyState icon={LuReceipt} title="No transactions yet" body="Deposits, withdrawals and trades will be listed here." />;
  }

  const rate = usdToCurrency(1, currency, rates);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">Search transactions</span>
        <LuSearch aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(PAGE);
          }}
          placeholder="Search by asset, type, currency or date…"
          className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              {COLUMNS.map((col) => {
                const active = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`px-2 pb-1.5 font-medium ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort((current) => nextTxSort(current, col.key))}
                      className={`inline-flex items-center gap-0.5 rounded hover:text-foreground ${active ? 'text-foreground' : ''}`}
                    >
                      {col.label}
                      {active ? sort.dir === 'asc' ? <LuArrowUp aria-hidden className="size-3" /> : <LuArrowDown aria-hidden className="size-3" /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((tx) => (
              <TransactionRow key={tx.id} tx={tx} currency={currency} rate={rate} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No transactions match “{query}”.</p>
      ) : null}
      {rows.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="self-center rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Show more ({rows.length - shown} left)
        </button>
      ) : null}
    </div>
  );
}

function TransactionRow({ tx, currency, rate }: { tx: MarketTransaction; currency: string; rate: number }) {
  const value = signedValueUsd(tx) * rate;
  const trade = tx.symbol !== undefined;
  return (
    <tr data-tx={tx.id} className="border-t border-border/60">
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-2">
          {trade ? (
            <AssetIcon symbol={tx.symbol as string} size={24} />
          ) : (
            <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LuCreditCard className="size-3.5" />
            </span>
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{txSubject(tx)}</span>
            <span className="block text-[10px] text-muted-foreground">{trade ? tx.symbol : tx.currency}</span>
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
        <time dateTime={new Date(tx.ts).toISOString()}>
          {new Date(tx.ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </time>
      </td>
      <td className="px-2 py-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLE[tx.type]}`}>{TX_TYPE_LABEL[tx.type]}</span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
        {tx.quantity !== undefined ? formatQuantity(txAmount(tx)) : formatMoney(tx.fiatAmount, tx.currency)}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {tx.priceUsd !== undefined ? formatMoney(tx.priceUsd * rate, currency) : '—'}
      </td>
      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${value >= 0 ? 'text-success' : 'text-destructive'}`}>
        {value >= 0 ? '+' : '−'}
        {formatMoney(Math.abs(value), currency)}
      </td>
    </tr>
  );
}
