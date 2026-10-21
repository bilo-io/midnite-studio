import { describe, expect, it } from 'vitest';

import {
  MarketPortfolioSchema,
  assetColor,
  cardLastFour,
  currencyToUsd,
  usdToCurrency,
  MARKET_CATALOGUE,
  DEFAULT_WATCHLIST,
  type MarketPortfolio,
} from './markets';
import {
  MarketPortfolioOpSchema,
  applyPortfolioOp,
  canWithdraw,
  replayTransactions,
  seedPortfolio,
  type PortfolioContext,
} from './markets-portfolio';

const NOW = 1_800_000_000_000;
const RATES = { USD: 1, EUR: 0.9, ZAR: 20 };

const ctx = (patch: Partial<PortfolioContext> = {}): PortfolioContext => {
  let n = 0;
  return { now: NOW, newId: () => `tx-${++n}`, rates: RATES, ...patch };
};

const empty = (): MarketPortfolio => ({
  version: 1,
  balances: { USD: 100, ZAR: 0 },
  holdings: [],
  transactions: [],
  watchlist: [],
  extraAssets: [],
});

const BTC = { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto' as const };

describe('deposit and withdraw', () => {
  it('deposits into a card and logs the USD value through the rate table', () => {
    const out = applyPortfolioOp(empty(), { op: 'deposit', currency: 'ZAR', amount: 2000 }, ctx());
    if (!out.ok) throw new Error(out.message);
    expect(out.portfolio.balances.ZAR).toBe(2000);
    expect(out.portfolio.transactions).toEqual([
      expect.objectContaining({ type: 'deposit', currency: 'ZAR', fiatAmount: 2000, valueUsd: 100, fxRate: 20 }),
    ]);
  });

  it('refuses to withdraw below zero and leaves the portfolio untouched', () => {
    const out = applyPortfolioOp(empty(), { op: 'withdraw', currency: 'USD', amount: 100.01 }, ctx());
    expect(out).toEqual({ ok: false, message: expect.stringContaining('Insufficient balance') });
  });

  it('allows withdrawing exactly the balance, landing on zero', () => {
    const out = applyPortfolioOp(empty(), { op: 'withdraw', currency: 'USD', amount: 100 }, ctx());
    if (!out.ok) throw new Error(out.message);
    expect(out.portfolio.balances.USD).toBe(0);
  });

  it('rounds to cents so float drift cannot leave a stray fraction', () => {
    let p = empty();
    for (let i = 0; i < 10; i += 1) {
      const out = applyPortfolioOp(p, { op: 'deposit', currency: 'USD', amount: 0.1 }, ctx());
      if (!out.ok) throw new Error(out.message);
      p = out.portfolio;
    }
    expect(p.balances.USD).toBe(101);
  });

  it('needs a rate for a non-USD currency', () => {
    const out = applyPortfolioOp(empty(), { op: 'deposit', currency: 'JPY', amount: 10 }, ctx());
    expect(out.ok).toBe(false);
  });

  it('canWithdraw mirrors the rule the UI reads', () => {
    expect(canWithdraw(empty(), 'USD', 100)).toBe(true);
    expect(canWithdraw(empty(), 'USD', 100.5)).toBe(false);
    expect(canWithdraw(empty(), 'USD', 0)).toBe(false);
    expect(canWithdraw(empty(), 'GBP', 1)).toBe(false);
  });
});

describe('buy and sell', () => {
  it('converts the cost through the rate for a non-USD card', () => {
    const start = { ...empty(), balances: { ZAR: 100_000 } };
    const out = applyPortfolioOp(start, { op: 'buy', asset: BTC, quantity: 0.05, currency: 'ZAR' }, ctx({ priceUsd: 60_000 }));
    if (!out.ok) throw new Error(out.message);
    // 0.05 * 60,000 USD = 3,000 USD = 60,000 ZAR at 20
    expect(out.portfolio.balances.ZAR).toBe(40_000);
    expect(out.portfolio.transactions[0]).toMatchObject({ fiatAmount: 60_000, valueUsd: 3000, fxRate: 20 });
  });

  it('refuses a purchase the card cannot cover', () => {
    const out = applyPortfolioOp(empty(), { op: 'buy', asset: BTC, quantity: 1, currency: 'USD' }, ctx({ priceUsd: 60_000 }));
    expect(out).toEqual({ ok: false, message: expect.stringContaining('Insufficient USD') });
  });

  it('adds a holding and debits cash on a buy', () => {
    const out = applyPortfolioOp(empty(), { op: 'buy', asset: BTC, quantity: 0.001, currency: 'USD' }, ctx({ priceUsd: 50_000 }));
    if (!out.ok) throw new Error(out.message);
    expect(out.portfolio.balances.USD).toBe(50);
    expect(out.portfolio.holdings).toEqual([{ ...BTC, quantity: 0.001 }]);
    expect(out.portfolio.transactions[0]).toMatchObject({ type: 'buy', symbol: 'BTC', priceUsd: 50_000, valueUsd: 50 });
  });

  it('cannot sell more than is held, and drops a holding sold down to nothing', () => {
    const held = { ...empty(), holdings: [{ ...BTC, quantity: 0.2 }] };
    expect(applyPortfolioOp(held, { op: 'sell', asset: BTC, quantity: 0.3, currency: 'USD' }, ctx({ priceUsd: 1000 })).ok).toBe(false);
    const out = applyPortfolioOp(held, { op: 'sell', asset: BTC, quantity: 0.2, currency: 'USD' }, ctx({ priceUsd: 1000 }));
    if (!out.ok) throw new Error(out.message);
    expect(out.portfolio.holdings).toEqual([]);
    expect(out.portfolio.balances.USD).toBe(300);
  });

  it('fails cleanly without a price', () => {
    const out = applyPortfolioOp(empty(), { op: 'buy', asset: BTC, quantity: 1, currency: 'USD' }, ctx());
    expect(out).toEqual({ ok: false, message: expect.stringContaining('No price') });
  });

  it('remembers an asset that is not in the catalogue so Markets can list it', () => {
    const odd = { symbol: 'ZZZZ', name: 'Zed Corp', kind: 'stock' as const };
    const out = applyPortfolioOp(empty(), { op: 'buy', asset: odd, quantity: 1, currency: 'USD' }, ctx({ priceUsd: 5 }));
    if (!out.ok) throw new Error(out.message);
    expect(out.portfolio.extraAssets).toEqual([odd]);
  });
});

describe('watch', () => {
  it('toggles the watchlist without duplicates', () => {
    let p = empty();
    for (const watched of [true, true, false]) {
      const out = applyPortfolioOp(p, { op: 'watch', asset: BTC, watched }, ctx());
      if (!out.ok) throw new Error(out.message);
      p = out.portfolio;
    }
    expect(p.watchlist).toEqual([]);
  });
});

describe('seed', () => {
  const seeded = seedPortfolio(NOW);

  it('is a valid persisted portfolio with the default watchlist', () => {
    expect(MarketPortfolioSchema.safeParse(seeded).success).toBe(true);
    expect(seeded.watchlist).toEqual([...DEFAULT_WATCHLIST]);
  });

  it('agrees with itself: replaying the log reproduces balances and holdings', () => {
    const replay = replayTransactions(seeded.transactions);
    expect(replay.balances).toEqual(seeded.balances);
    expect(replay.holdings).toEqual(Object.fromEntries(seeded.holdings.map((h) => [h.symbol, h.quantity])));
  });

  it('never has a negative balance and holds only catalogue assets', () => {
    expect(Object.values(seeded.balances).every((b) => b >= 0)).toBe(true);
    expect(seeded.holdings.every((h) => MARKET_CATALOGUE.some((a) => a.symbol === h.symbol))).toBe(true);
  });
});

describe('op schema', () => {
  it('rejects non-positive and non-finite amounts', () => {
    expect(MarketPortfolioOpSchema.safeParse({ op: 'deposit', currency: 'USD', amount: 0 }).success).toBe(false);
    expect(MarketPortfolioOpSchema.safeParse({ op: 'deposit', currency: 'USD', amount: -5 }).success).toBe(false);
    expect(MarketPortfolioOpSchema.safeParse({ op: 'deposit', currency: 'USD', amount: Infinity }).success).toBe(false);
    expect(MarketPortfolioOpSchema.safeParse({ op: 'deposit', currency: 'usd', amount: 5 }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('converts both ways through the rate table', () => {
    expect(usdToCurrency(10, 'ZAR', RATES)).toBe(200);
    expect(currencyToUsd(200, 'ZAR', RATES)).toBe(10);
    expect(usdToCurrency(10, 'XXX', RATES)).toBe(10);
  });

  it('has a stable card number and a brand colour with a neutral fallback', () => {
    expect(cardLastFour('USD')).toBe(cardLastFour('USD'));
    expect(cardLastFour('USD')).toMatch(/^\d{4}$/);
    expect(assetColor('BTC')).toBe('#F7931A');
    expect(assetColor('NOPE')).toBe('#64748B');
  });
});
