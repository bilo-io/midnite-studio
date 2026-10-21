import { z } from 'zod';

/**
 * The Finance dashboard's wire contract and its pure vocabulary — timescales,
 * the curated asset catalogue, currencies, and the simulated portfolio's shape.
 *
 * Distinct from the older `finance.*` bridge namespace (Phase 76 Theme D, the
 * status-bar ticker that needs a Twelve Data key). Everything here is key-free,
 * and every price that crosses the boundary is in **USD** — the display
 * currency is a renderer concern applied through the exchange-rate table.
 */

// --- timescales ----------------------------------------------------------------

export const MARKET_TIMESCALES = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'ALL'] as const;
export const MarketTimescaleSchema = z.enum(MARKET_TIMESCALES);
export type MarketTimescale = z.infer<typeof MarketTimescaleSchema>;

const DAY_MS = 86_400_000;

/**
 * How far back each timescale reaches, measured from the newest candle (not
 * the wall clock, so a weekend's last session still fills a "1D" chart).
 * `ALL` is unbounded.
 */
export const MARKET_TIMESCALE_MS: Record<MarketTimescale, number | null> = {
  '1D': DAY_MS,
  '1W': 7 * DAY_MS,
  '1M': 30 * DAY_MS,
  '3M': 90 * DAY_MS,
  '1Y': 365 * DAY_MS,
  '5Y': 5 * 365 * DAY_MS,
  ALL: null,
};

export const MARKET_TIMESCALE_LABEL: Record<MarketTimescale, string> = {
  '1D': 'past day',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  ALL: 'all time',
};

// --- assets ----------------------------------------------------------------------

export const MARKET_ASSET_KINDS = ['crypto', 'stock', 'etf'] as const;
export const MarketAssetKindSchema = z.enum(MARKET_ASSET_KINDS);
export type MarketAssetKind = z.infer<typeof MarketAssetKindSchema>;

/**
 * What main needs to fetch an asset: its symbol, its name and its kind (which
 * picks the provider chain). Symbols are the unit of identity throughout.
 */
export const MarketAssetSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9.\-^]+$/, 'symbol has unsupported characters'),
  name: z.string().min(1).max(120),
  kind: MarketAssetKindSchema,
});
export type MarketAsset = z.infer<typeof MarketAssetSchema>;

export type CatalogueAsset = MarketAsset & {
  /** Brand colour — used for the donut, the transaction icon and chart accents. */
  color: string;
  /** CoinGecko id, for the OHLC fallback and search de-duplication. */
  coingeckoId?: string;
};

/**
 * The curated catalogue: the assets that exist before anyone searches. The
 * Watchlist and Markets cards partition it (plus anything a user adds by
 * search); the colours are each brand's own, picked to read on both themes.
 */
export const MARKET_CATALOGUE: readonly CatalogueAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', color: '#F7931A', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', kind: 'crypto', color: '#627EEA', coingeckoId: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', kind: 'crypto', color: '#9945FF', coingeckoId: 'solana' },
  { symbol: 'XRP', name: 'XRP', kind: 'crypto', color: '#00AAE4', coingeckoId: 'ripple' },
  { symbol: 'BNB', name: 'BNB', kind: 'crypto', color: '#F3BA2F', coingeckoId: 'binancecoin' },
  { symbol: 'DOGE', name: 'Dogecoin', kind: 'crypto', color: '#C2A633', coingeckoId: 'dogecoin' },
  { symbol: 'ADA', name: 'Cardano', kind: 'crypto', color: '#3468D1', coingeckoId: 'cardano' },
  { symbol: 'AVAX', name: 'Avalanche', kind: 'crypto', color: '#E84142', coingeckoId: 'avalanche-2' },
  { symbol: 'DOT', name: 'Polkadot', kind: 'crypto', color: '#E6007A', coingeckoId: 'polkadot' },
  { symbol: 'LINK', name: 'Chainlink', kind: 'crypto', color: '#2A5ADA', coingeckoId: 'chainlink' },
  { symbol: 'LTC', name: 'Litecoin', kind: 'crypto', color: '#7C8EA3', coingeckoId: 'litecoin' },
  { symbol: 'XLM', name: 'Stellar', kind: 'crypto', color: '#14B6E7', coingeckoId: 'stellar' },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock', color: '#8E8E93' },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock', color: '#00A4EF' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', color: '#76B900' },
  { symbol: 'TSLA', name: 'Tesla', kind: 'stock', color: '#E31937' },
  { symbol: 'GOOGL', name: 'Alphabet', kind: 'stock', color: '#4285F4' },
  { symbol: 'AMZN', name: 'Amazon', kind: 'stock', color: '#FF9900' },
  { symbol: 'META', name: 'Meta Platforms', kind: 'stock', color: '#0668E1' },
  { symbol: 'NFLX', name: 'Netflix', kind: 'stock', color: '#E50914' },
  { symbol: 'AMD', name: 'AMD', kind: 'stock', color: '#ED1C24' },
  { symbol: 'INTC', name: 'Intel', kind: 'stock', color: '#0071C5' },
  { symbol: 'COIN', name: 'Coinbase', kind: 'stock', color: '#0052FF' },
  { symbol: 'V', name: 'Visa', kind: 'stock', color: '#1A1F71' },
  { symbol: 'KO', name: 'Coca-Cola', kind: 'stock', color: '#F40009' },
  { symbol: 'UBER', name: 'Uber', kind: 'stock', color: '#8A8A8A' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'etf', color: '#2E9E6B' },
  { symbol: 'QQQ', name: 'Invesco QQQ', kind: 'etf', color: '#7B5CD6' },
];

export const DEFAULT_WATCHLIST: readonly string[] = [
  'BTC',
  'ETH',
  'SOL',
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'SPY',
];

const CATALOGUE_BY_SYMBOL = new Map(MARKET_CATALOGUE.map((asset) => [asset.symbol, asset]));

export const catalogueAsset = (symbol: string): CatalogueAsset | undefined =>
  CATALOGUE_BY_SYMBOL.get(symbol.toUpperCase());

/** Neutral colour for an asset that has no brand entry (a search hit, say). */
export const FALLBACK_ASSET_COLOR = '#64748B';

export const assetColor = (symbol: string): string =>
  catalogueAsset(symbol)?.color ?? FALLBACK_ASSET_COLOR;

// --- currencies ----------------------------------------------------------------

export type MarketCurrency = { code: string; name: string; symbol: string };

/** The display / cash currencies offered in the pickers. USD is the unit of storage. */
export const MARKET_CURRENCIES: readonly MarketCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: 'CN¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł' },
];

export const MarketCurrencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code');

export const marketCurrency = (code: string): MarketCurrency =>
  MARKET_CURRENCIES.find((c) => c.code === code) ?? { code, name: code, symbol: code };

/** The exchange-rate table: units of each currency per ONE US dollar. */
export type MarketRates = Record<string, number>;

/** `usd` expressed in `currency`. A currency with no rate is returned as USD (rate 1). */
export const usdToCurrency = (usd: number, currency: string, rates: MarketRates): number =>
  usd * (currency === 'USD' ? 1 : (rates[currency] ?? 1));

/** `amount` of `currency` expressed in USD. A currency with no rate is treated as USD. */
export const currencyToUsd = (amount: number, currency: string, rates: MarketRates): number => {
  if (currency === 'USD') return amount;
  const rate = rates[currency];
  return rate && rate > 0 ? amount / rate : amount;
};

// --- candles + series ------------------------------------------------------------

/** One OHLC bar, prices in USD, `t` in epoch milliseconds. */
export const MarketCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().optional(),
});
export type MarketCandle = z.infer<typeof MarketCandleSchema>;

export const MarketSeriesEntrySchema = z.object({
  candles: z.array(MarketCandleSchema),
  /** When main last got this from the network; null when it never has. */
  fetchedAt: z.number().nullable(),
  /** True when the live fetch failed and cached data is being served instead. */
  stale: z.boolean(),
  /** Which provider answered, for the tooltip. */
  source: z.string().nullable(),
  /** Set (with empty candles) when there is nothing to show at all. */
  error: z.string().optional(),
});
export type MarketSeriesEntry = z.infer<typeof MarketSeriesEntrySchema>;

export const MarketQuoteEntrySchema = z.object({
  /** USD. */
  price: z.number().nullable(),
  t: z.number().nullable(),
  stale: z.boolean(),
  error: z.string().optional(),
});
export type MarketQuoteEntry = z.infer<typeof MarketQuoteEntrySchema>;

// --- portfolio ---------------------------------------------------------------------

export const MARKET_TX_TYPES = ['deposit', 'withdraw', 'buy', 'sell'] as const;
export const MarketTxTypeSchema = z.enum(MARKET_TX_TYPES);
export type MarketTxType = z.infer<typeof MarketTxTypeSchema>;

export const MarketTransactionSchema = z.object({
  id: z.string(),
  ts: z.number(),
  type: MarketTxTypeSchema,
  /** The fiat currency of the cash leg. */
  currency: MarketCurrencyCodeSchema,
  /** Cash moved, in `currency`, always positive. */
  fiatAmount: z.number(),
  /** Set on buy/sell. */
  symbol: z.string().optional(),
  assetName: z.string().optional(),
  assetKind: MarketAssetKindSchema.optional(),
  quantity: z.number().optional(),
  /** USD per unit at the moment of the trade. */
  priceUsd: z.number().optional(),
  /** Total in USD — the unit everything is stored in. */
  valueUsd: z.number(),
  /** Units of `currency` per USD when this was recorded. */
  fxRate: z.number().optional(),
});
export type MarketTransaction = z.infer<typeof MarketTransactionSchema>;

export const MarketHoldingSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  kind: MarketAssetKindSchema,
  quantity: z.number(),
});
export type MarketHolding = z.infer<typeof MarketHoldingSchema>;

export const MarketPortfolioSchema = z.object({
  version: z.literal(1),
  /** Cash per currency, in that currency's own units. */
  balances: z.record(z.number()),
  holdings: z.array(MarketHoldingSchema),
  transactions: z.array(MarketTransactionSchema),
  /** Symbols the user watches; the Watchlist card shows exactly these. */
  watchlist: z.array(z.string()),
  /** Assets added from search that are not in the catalogue. */
  extraAssets: z.array(MarketAssetSchema),
});
export type MarketPortfolio = z.infer<typeof MarketPortfolioSchema>;

/** Card numbers for the wallet — a stable, fake, per-currency last four. */
export const cardLastFour = (currency: string): string => {
  let hash = 7;
  for (const ch of currency) hash = (hash * 31 + ch.charCodeAt(0)) % 10_000;
  return String(hash).padStart(4, '0');
};

// --- news ----------------------------------------------------------------------------

export const MarketNewsSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('feed'), url: z.string().url().max(500), label: z.string().max(60).optional() }),
  z.object({ kind: z.literal('keyword'), query: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('asset'), symbol: z.string().min(1).max(16), name: z.string().min(1).max(120) }),
]);
export type MarketNewsSource = z.infer<typeof MarketNewsSourceSchema>;

export const MarketNewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string(),
  /** The publisher, or the feed's own title. */
  source: z.string(),
  publishedAt: z.number().nullable(),
  summary: z.string().optional(),
  /** What matched: a symbol, a keyword or a feed label. */
  origin: z.string(),
});
export type MarketNewsItem = z.infer<typeof MarketNewsItemSchema>;
