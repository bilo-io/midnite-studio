import { z } from 'zod';

import {
  DEFAULT_WATCHLIST,
  MarketAssetSchema,
  MarketCurrencyCodeSchema,
  catalogueAsset,
  currencyToUsd,
  usdToCurrency,
  type MarketAsset,
  type MarketHolding,
  type MarketPortfolio,
  type MarketRates,
  type MarketTransaction,
} from './markets';

/**
 * The simulated portfolio's rules, as pure functions.
 *
 * Main persists and orders the writes; this module decides what a write MEANS,
 * so the same invariants — cash never below zero, no selling what you do not
 * hold — are asserted by plain unit tests with no Electron and no disk. The
 * renderer imports `canWithdraw` to disable a button, but main is the one that
 * enforces: a disabled button is a courtesy, the check here is the rule.
 */

export const MarketPortfolioOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.enum(['deposit', 'withdraw']),
    currency: MarketCurrencyCodeSchema,
    amount: z.number().positive().finite().max(1_000_000_000_000),
  }),
  z.object({ op: z.literal('addCard'), currency: MarketCurrencyCodeSchema }),
  z.object({
    op: z.enum(['buy', 'sell']),
    asset: MarketAssetSchema,
    quantity: z.number().positive().finite().max(1_000_000_000_000),
    /** The card the cash leg moves through. */
    currency: MarketCurrencyCodeSchema,
  }),
  z.object({ op: z.literal('watch'), asset: MarketAssetSchema, watched: z.boolean() }),
]);
export type MarketPortfolioOp = z.infer<typeof MarketPortfolioOpSchema>;

export type PortfolioContext = {
  now: number;
  newId: () => string;
  /** Units per USD. Required for any non-USD cash leg. */
  rates: MarketRates;
  /** Current USD price of the traded asset — main supplies it, never the renderer. */
  priceUsd?: number | undefined;
};

export type PortfolioOutcome =
  | { ok: true; portfolio: MarketPortfolio }
  | { ok: false; message: string };

const MAX_TRANSACTIONS = 5000;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round8 = (n: number): number => Math.round(n * 1e8) / 1e8;

const fail = (message: string): PortfolioOutcome => ({ ok: false, message });

/** Whether `amount` could leave this card — the one rule the UI also reads. */
export const canWithdraw = (portfolio: MarketPortfolio, currency: string, amount: number): boolean =>
  amount > 0 && amount <= (portfolio.balances[currency] ?? 0) + 1e-9;

export const holdingQuantity = (portfolio: MarketPortfolio, symbol: string): number =>
  portfolio.holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;

const hasRate = (currency: string, rates: MarketRates): boolean =>
  currency === 'USD' || (rates[currency] ?? 0) > 0;

const withTransaction = (
  portfolio: MarketPortfolio,
  patch: Partial<MarketPortfolio>,
  tx: MarketTransaction,
): MarketPortfolio => ({
  ...portfolio,
  ...patch,
  transactions: [...portfolio.transactions, tx].slice(-MAX_TRANSACTIONS),
});

const withExtra = (portfolio: MarketPortfolio, asset: MarketAsset): MarketPortfolio =>
  catalogueAsset(asset.symbol) || portfolio.extraAssets.some((a) => a.symbol === asset.symbol)
    ? portfolio
    : { ...portfolio, extraAssets: [...portfolio.extraAssets, asset] };

export function applyPortfolioOp(
  portfolio: MarketPortfolio,
  op: MarketPortfolioOp,
  ctx: PortfolioContext,
): PortfolioOutcome {
  switch (op.op) {
    case 'addCard': {
      if (op.currency in portfolio.balances) return { ok: true, portfolio };
      return { ok: true, portfolio: { ...portfolio, balances: { ...portfolio.balances, [op.currency]: 0 } } };
    }

    case 'watch': {
      const on = portfolio.watchlist.includes(op.asset.symbol);
      if (op.watched === on) return { ok: true, portfolio: withExtra(portfolio, op.asset) };
      const watchlist = op.watched
        ? [...portfolio.watchlist, op.asset.symbol]
        : portfolio.watchlist.filter((s) => s !== op.asset.symbol);
      return { ok: true, portfolio: withExtra({ ...portfolio, watchlist }, op.asset) };
    }

    case 'deposit':
    case 'withdraw': {
      if (!hasRate(op.currency, ctx.rates)) {
        return fail(`No exchange rate for ${op.currency} yet — try again once rates load.`);
      }
      const amount = round2(op.amount);
      if (amount <= 0) return fail('Enter an amount of at least 0.01.');
      const balance = portfolio.balances[op.currency] ?? 0;
      if (op.op === 'withdraw' && !canWithdraw(portfolio, op.currency, amount)) {
        return fail(`Insufficient balance — ${op.currency} ${balance.toFixed(2)} available.`);
      }
      const next = round2(balance + (op.op === 'deposit' ? amount : -amount));
      return {
        ok: true,
        portfolio: withTransaction(
          portfolio,
          { balances: { ...portfolio.balances, [op.currency]: Math.max(0, next) } },
          {
            id: ctx.newId(),
            ts: ctx.now,
            type: op.op,
            currency: op.currency,
            fiatAmount: amount,
            valueUsd: round2(currencyToUsd(amount, op.currency, ctx.rates)),
            fxRate: op.currency === 'USD' ? 1 : ctx.rates[op.currency],
          },
        ),
      };
    }

    case 'buy':
    case 'sell': {
      const price = ctx.priceUsd;
      if (price === undefined || !Number.isFinite(price) || price <= 0) {
        return fail(`No price for ${op.asset.symbol} right now — try again shortly.`);
      }
      if (!hasRate(op.currency, ctx.rates)) {
        return fail(`No exchange rate for ${op.currency} yet — try again once rates load.`);
      }
      const quantity = round8(op.quantity);
      if (quantity <= 0) return fail('Quantity is too small.');
      const valueUsd = quantity * price;
      const fiat = round2(usdToCurrency(valueUsd, op.currency, ctx.rates));
      if (fiat <= 0) return fail('That trade is worth less than 0.01.');
      const balance = portfolio.balances[op.currency] ?? 0;
      const held = holdingQuantity(portfolio, op.asset.symbol);

      let holdings: MarketHolding[];
      let nextBalance: number;
      if (op.op === 'buy') {
        if (fiat > balance + 1e-9) {
          return fail(`Insufficient ${op.currency} — need ${fiat.toFixed(2)}, have ${balance.toFixed(2)}.`);
        }
        nextBalance = balance - fiat;
        const existing = portfolio.holdings.find((h) => h.symbol === op.asset.symbol);
        holdings = existing
          ? portfolio.holdings.map((h) =>
              h.symbol === op.asset.symbol ? { ...h, quantity: round8(h.quantity + quantity) } : h,
            )
          : [
              ...portfolio.holdings,
              { symbol: op.asset.symbol, name: op.asset.name, kind: op.asset.kind, quantity },
            ];
      } else {
        if (quantity > held + 1e-9) {
          return fail(`You hold ${held} ${op.asset.symbol} — cannot sell ${quantity}.`);
        }
        nextBalance = balance + fiat;
        holdings = portfolio.holdings
          .map((h) =>
            h.symbol === op.asset.symbol ? { ...h, quantity: round8(Math.max(0, h.quantity - quantity)) } : h,
          )
          .filter((h) => h.quantity > 0);
      }

      return {
        ok: true,
        portfolio: withExtra(
          withTransaction(
            portfolio,
            { holdings, balances: { ...portfolio.balances, [op.currency]: round2(nextBalance) } },
            {
              id: ctx.newId(),
              ts: ctx.now,
              type: op.op,
              currency: op.currency,
              fiatAmount: fiat,
              symbol: op.asset.symbol,
              assetName: op.asset.name,
              assetKind: op.asset.kind,
              quantity,
              priceUsd: price,
              valueUsd: round2(valueUsd),
              fxRate: op.currency === 'USD' ? 1 : ctx.rates[op.currency],
            },
          ),
          op.asset,
        ),
      };
    }
  }
}

// --- seed ------------------------------------------------------------------------------

const SEED_RATES: MarketRates = { USD: 1, EUR: 0.89, ZAR: 17.5, GBP: 0.76 };
const DAY = 86_400_000;

const SEED_SCRIPT: { daysAgo: number; op: MarketPortfolioOp; price?: number }[] = [
  { daysAgo: 120, op: { op: 'deposit', currency: 'USD', amount: 20_000 } },
  { daysAgo: 120, op: { op: 'deposit', currency: 'EUR', amount: 5_000 } },
  { daysAgo: 118, op: { op: 'deposit', currency: 'ZAR', amount: 50_000 } },
  { daysAgo: 110, op: { op: 'buy', currency: 'USD', quantity: 0.12, asset: seedAsset('BTC') }, price: 68_000 },
  { daysAgo: 104, op: { op: 'buy', currency: 'USD', quantity: 1.5, asset: seedAsset('ETH') }, price: 2_600 },
  { daysAgo: 96, op: { op: 'buy', currency: 'USD', quantity: 12, asset: seedAsset('AAPL') }, price: 230 },
  { daysAgo: 90, op: { op: 'buy', currency: 'USD', quantity: 10, asset: seedAsset('NVDA') }, price: 130 },
  { daysAgo: 75, op: { op: 'buy', currency: 'EUR', quantity: 25, asset: seedAsset('SOL') }, price: 150 },
  { daysAgo: 60, op: { op: 'buy', currency: 'ZAR', quantity: 5, asset: seedAsset('SPY') }, price: 560 },
  { daysAgo: 42, op: { op: 'sell', currency: 'USD', quantity: 0.02, asset: seedAsset('BTC') }, price: 70_000 },
  { daysAgo: 30, op: { op: 'withdraw', currency: 'ZAR', amount: 500 } },
  { daysAgo: 12, op: { op: 'deposit', currency: 'USD', amount: 1_000 } },
];

function seedAsset(symbol: string): MarketAsset {
  const found = catalogueAsset(symbol);
  return { symbol, name: found?.name ?? symbol, kind: found?.kind ?? 'stock' };
}

/**
 * A believable starter portfolio. It is built by REPLAYING a script through
 * {@link applyPortfolioOp} rather than written out as literals, so the seeded
 * balances, holdings and log agree with each other by construction — the same
 * way any later state does.
 */
export function seedPortfolio(now: number): MarketPortfolio {
  let portfolio: MarketPortfolio = {
    version: 1,
    balances: {},
    holdings: [],
    transactions: [],
    watchlist: [...DEFAULT_WATCHLIST],
    extraAssets: [],
  };
  let n = 0;
  for (const step of SEED_SCRIPT) {
    const outcome = applyPortfolioOp(portfolio, step.op, {
      now: now - step.daysAgo * DAY,
      newId: () => `seed-${++n}`,
      rates: SEED_RATES,
      priceUsd: step.price,
    });
    if (outcome.ok) portfolio = outcome.portfolio;
  }
  return portfolio;
}

/** Fold a transaction log back into balances + holdings — the invariant tests lean on. */
export function replayTransactions(transactions: readonly MarketTransaction[]): {
  balances: Record<string, number>;
  holdings: Record<string, number>;
} {
  const balances: Record<string, number> = {};
  const holdings: Record<string, number> = {};
  for (const tx of transactions) {
    const cash = tx.type === 'deposit' || tx.type === 'sell' ? tx.fiatAmount : -tx.fiatAmount;
    balances[tx.currency] = round2((balances[tx.currency] ?? 0) + cash);
    if (tx.symbol && tx.quantity) {
      const delta = tx.type === 'buy' ? tx.quantity : -tx.quantity;
      holdings[tx.symbol] = round8((holdings[tx.symbol] ?? 0) + delta);
    }
  }
  return { balances, holdings };
}
