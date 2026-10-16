// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { financeManifest } from '../manifest';
import { financeMain, type FinanceMainServices } from './index';
import type { Fetcher } from './markets/http';
import type { MarketsRuntime } from './runtime';

const asset = { symbol: 'AAPL', name: 'Apple', kind: 'stock' };

const runtime = () => ({
  markets: {
    getSeriesBatch: vi.fn(async () => ({ AAPL: { candles: [], fetchedAt: null, stale: false, source: null, error: 'x' } })),
    getQuoteBatch: vi.fn(async () => ({ AAPL: { price: 1, t: 1, stale: false } })),
    search: vi.fn(async () => [asset]),
    getRates: vi.fn(async () => ({ base: 'USD' as const, rates: { USD: 1 }, fetchedAt: 1, stale: false })),
  },
  portfolio: { get: vi.fn(), apply: vi.fn() },
  news: { getNews: vi.fn(async () => ({ items: [], stale: false, failed: [] })) },
});

/** A transport that records every URL and answers `body`; no test here can reach the network. */
function fixtureFetcher(body: unknown): { fetcher: Fetcher; urls: string[] } {
  const urls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetcher, urls };
}

describe('finance main — markets', () => {
  let rt: ReturnType<typeof runtime>;
  let ctx: ReturnType<typeof createRecordingContext>;
  beforeEach(() => {
    rt = runtime();
    ctx = createRecordingContext();
    financeMain.register(ctx, { runtime: rt as unknown as MarketsRuntime, twelveDataKey: async () => null });
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...financeManifest.ipc].sort());
  });

  it('wraps a series answer in an ok envelope', async () => {
    const out = await ctx.invoke(CHANNELS.marketsSeries, { assets: [asset], timescale: '1M' });
    expect(out).toMatchObject({ ok: true, value: { series: { AAPL: expect.any(Object) } } });
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await ctx.invoke(CHANNELS.marketsSeries, { assets: [], timescale: '1M' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await ctx.invoke(CHANNELS.marketsSeries, { assets: [asset], timescale: '2H' })).toMatchObject({ ok: false });
    expect(rt.markets.getSeriesBatch).not.toHaveBeenCalled();
  });

  it('turns a thrown service error into a failure envelope', async () => {
    rt.markets.search.mockRejectedValueOnce(new Error('boom'));
    expect(await ctx.invoke(CHANNELS.marketsSearch, { query: 'x' })).toEqual({ ok: false, kind: 'error', message: 'boom' });
  });

  it('rejects an empty search and a negative withdrawal before reaching the store', async () => {
    expect(await ctx.invoke(CHANNELS.marketsSearch, { query: '  ' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.marketsPortfolioApply, { op: 'withdraw', currency: 'USD', amount: -1 })).toMatchObject({ ok: false });
    expect(rt.portfolio.apply).not.toHaveBeenCalled();
  });

  it('maps a refused portfolio op to a failure message', async () => {
    rt.portfolio.apply.mockResolvedValueOnce({ ok: false, message: 'Insufficient balance' });
    expect(await ctx.invoke(CHANNELS.marketsPortfolioApply, { op: 'withdraw', currency: 'USD', amount: 5 })).toEqual({
      ok: false,
      kind: 'error',
      message: 'Insufficient balance',
    });
  });

  it('returns the portfolio on success', async () => {
    const value = { version: 1, balances: {}, holdings: [], transactions: [], watchlist: [], extraAssets: [] };
    rt.portfolio.get.mockResolvedValueOnce(value);
    expect(await ctx.invoke(CHANNELS.marketsPortfolioGet)).toEqual({ ok: true, value });
  });

  it('applies the news default limit', async () => {
    await ctx.invoke(CHANNELS.marketsNews, { sources: [{ kind: 'keyword', query: 'fed' }] });
    expect(rt.news.getNews).toHaveBeenCalledWith([{ kind: 'keyword', query: 'fed' }], 60);
  });
});

describe('finance main — the market-data key', () => {
  const register = (services: Partial<FinanceMainServices>) => {
    const ctx = createRecordingContext();
    financeMain.register(ctx, {
      runtime: runtime() as unknown as MarketsRuntime,
      twelveDataKey: async () => null,
      ...services,
    });
    return ctx;
  };

  it('uses the key main read for a stock quote, and the answer never contains it', async () => {
    const { fetcher, urls } = fixtureFetcher({ close: '12.5', currency: 'USD' });
    const ctx = register({ fetcher, twelveDataKey: async () => 'SECRET-KEY-123' });
    const out = await ctx.invoke(CHANNELS.financeQuote, { kind: 'stock', symbol: 'AAPL' });
    expect(out).toEqual({ ok: true, value: { price: 12.5, currency: 'USD' } });
    expect(urls[0]).toContain('apikey=SECRET-KEY-123');
    expect(JSON.stringify(out)).not.toContain('SECRET-KEY-123');
  });

  it('reads the key afresh on each call', async () => {
    const { fetcher, urls } = fixtureFetcher({ data: [] });
    const twelveDataKey = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce('one').mockResolvedValueOnce('two');
    const ctx = register({ fetcher, twelveDataKey });
    await ctx.invoke(CHANNELS.financeSearch, { kind: 'stock', query: 'a' });
    await ctx.invoke(CHANNELS.financeSearch, { kind: 'stock', query: 'b' });
    expect(urls.map((u) => /apikey=(\w+)/.exec(u)?.[1])).toEqual(['one', 'two']);
  });

  it('answers the missing-key message when the vault has none or refuses the app, without fetching', async () => {
    const { fetcher, urls } = fixtureFetcher({});
    const ctx = register({ fetcher, twelveDataKey: async () => null });
    for (const channel of [CHANNELS.financeSearch, CHANNELS.financeQuote, CHANNELS.financeHistory]) {
      const payload = channel === CHANNELS.financeSearch ? { kind: 'stock', query: 'a' } : { kind: 'stock', symbol: 'A' };
      expect(await ctx.invoke(channel, payload)).toMatchObject({ ok: false, message: expect.stringContaining('Twelve Data API key') });
    }
    expect(urls).toEqual([]);
  });

  it('serves crypto with no key at all', async () => {
    const { fetcher, urls } = fixtureFetcher({ market_data: { current_price: { usd: 100 } } });
    const ctx = register({ fetcher });
    expect(await ctx.invoke(CHANNELS.financeQuote, { kind: 'crypto', symbol: 'bitcoin' })).toEqual({
      ok: true,
      value: { price: 100, currency: 'USD' },
    });
    expect(urls[0]).not.toContain('apikey');
  });
});

describe('finance main — accounts', () => {
  const account = { id: 'alpaca-1', connector: 'alpaca', label: 'Paper', environment: 'paper', createdAt: 1 };
  const services = (accounts?: unknown) => {
    const ctx = createRecordingContext();
    financeMain.register(ctx, { runtime: runtime() as unknown as MarketsRuntime, twelveDataKey: async () => null, ...(accounts ? { accounts: accounts as never } : {}) });
    return ctx;
  };

  it('answers every account channel with an error envelope when the composer gave no accounts', async () => {
    const ctx = services();
    expect(await ctx.invoke(CHANNELS.financeAccountsList)).toMatchObject({ ok: false, kind: 'error' });
    expect(await ctx.invoke(CHANNELS.financeAccountSnapshots, {})).toMatchObject({ ok: false });
  });

  it('wraps the service answers and turns a throw into a failure envelope', async () => {
    const accounts = {
      list: vi.fn(async () => ({ connectors: [], accounts: [account] })),
      test: vi.fn(async () => 'Connected — 1 balance found.'),
      add: vi.fn(async () => account),
      remove: vi.fn(async () => true),
      snapshots: vi.fn(async () => []),
    };
    const ctx = services(accounts);
    expect(await ctx.invoke(CHANNELS.financeAccountsList)).toMatchObject({ ok: true, value: { accounts: [account] } });
    const fields = { apiKeyId: 'a', apiSecret: 'b' };
    expect(await ctx.invoke(CHANNELS.financeAccountTest, { connector: 'alpaca', fields })).toMatchObject({ ok: true });
    expect(accounts.test).toHaveBeenCalledWith({ connector: 'alpaca', environment: 'paper', fields });
    expect(await ctx.invoke(CHANNELS.financeAccountAdd, { connector: 'alpaca', fields, label: 'Paper' })).toEqual({ ok: true, value: { account } });
    expect(await ctx.invoke(CHANNELS.financeAccountRemove, { id: 'alpaca-1' })).toEqual({ ok: true, value: { removed: true } });
    accounts.snapshots.mockRejectedValueOnce(new Error('boom'));
    expect(await ctx.invoke(CHANNELS.financeAccountSnapshots, { refresh: true })).toEqual({ ok: false, kind: 'error', message: 'boom' });
  });

  it('rejects a malformed request before it reaches the service', async () => {
    const accounts = { add: vi.fn() };
    const ctx = services(accounts);
    expect(await ctx.invoke(CHANNELS.financeAccountAdd, { connector: 'binance', fields: {}, label: 'x' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.financeAccountRemove, { id: '../../etc' })).toMatchObject({ ok: false });
    expect(accounts.add).not.toHaveBeenCalled();
  });
});
