import type { MarketTransaction, MarketTxType } from '@midnite/studio-shared';

/**
 * Sorting and searching for the transaction table — pure, so the rules (what
 * "amount" means for a deposit versus a buy, which way is "newest first") are
 * tested rather than inferred from a rendered table.
 */

export type TxSortKey = 'date' | 'type' | 'asset' | 'amount' | 'price' | 'value';
export type TxSortDir = 'asc' | 'desc';

export const TX_TYPE_LABEL: Record<MarketTxType, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  buy: 'Buy',
  sell: 'Sell',
};

/** Money into the portfolio (a deposit) or out of a position (a sell) is positive; the reverse is negative. */
export const txSign = (type: MarketTxType): 1 | -1 => (type === 'deposit' || type === 'sell' ? 1 : -1);

export const signedValueUsd = (tx: MarketTransaction): number => txSign(tx.type) * tx.valueUsd;

/** What the row is *about*: the asset for a trade, the card for a cash movement. */
export const txSubject = (tx: MarketTransaction): string => tx.assetName ?? `${tx.currency} card`;

/** A trade's units, or a cash movement's fiat amount — the column's two meanings. */
export const txAmount = (tx: MarketTransaction): number => tx.quantity ?? tx.fiatAmount;

export function filterTransactions(txs: readonly MarketTransaction[], query: string): MarketTransaction[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...txs];
  return txs.filter((tx) =>
    [tx.symbol ?? '', tx.assetName ?? '', tx.type, TX_TYPE_LABEL[tx.type], tx.currency, new Date(tx.ts).toISOString().slice(0, 10)]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}

const keyValue = (tx: MarketTransaction, key: TxSortKey): number | string => {
  switch (key) {
    case 'date':
      return tx.ts;
    case 'type':
      return tx.type;
    case 'asset':
      return txSubject(tx).toLowerCase();
    case 'amount':
      return txAmount(tx);
    case 'price':
      // A cash movement has no unit price; sorting them below every trade keeps the column honest.
      return tx.priceUsd ?? Number.NEGATIVE_INFINITY;
    case 'value':
      return signedValueUsd(tx);
  }
};

export function sortTransactions(txs: readonly MarketTransaction[], key: TxSortKey, dir: TxSortDir): MarketTransaction[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...txs].sort((a, b) => {
    const x = keyValue(a, key);
    const y = keyValue(b, key);
    const order = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x === y ? 0 : x < y ? -1 : 1;
    // Ties fall back to newest-first so the order is total and stable across re-renders.
    return order === 0 ? b.ts - a.ts : order * sign;
  });
}

export const nextTxSort = (
  current: { key: TxSortKey; dir: TxSortDir },
  key: TxSortKey,
): { key: TxSortKey; dir: TxSortDir } =>
  current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'asset' || key === 'type' ? 'asc' : 'desc' };
