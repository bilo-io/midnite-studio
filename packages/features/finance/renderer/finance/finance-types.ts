export type AssetKind = 'crypto' | 'stock';

/** An entry in the watchlist — enough to round-trip into a quote/history call. */
export type FinanceAsset = {
  kind: AssetKind;
  /** CoinGecko coin id for crypto, ticker symbol for stocks. */
  symbol: string;
  name: string;
};

export type AssetSearchResult = FinanceAsset & { exchange?: string };

/**
 * Only `price`/`currency` — the source app's `MarketQuote` also carries OHLC
 * and a 24h change, but nothing here reads them: the panel's gain/loss comes
 * from `historyChange` on the 7-day series instead (see its doc comment).
 */
export type FinanceQuote = {
  price: number;
  currency: string;
};

export type HistoryPoint = { t: number; c: number };

export const assetKey = (a: FinanceAsset): string => `${a.kind}:${a.symbol}`;
