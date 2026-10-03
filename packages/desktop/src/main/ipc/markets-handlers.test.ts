import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, app: { getPath: () => '/nowhere' } }));

import { registerMarketsHandlers, type MarketsRuntime } from './markets-handlers';

function invoke(channel: string, raw?: unknown): Promise<unknown> {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler for ${channel}`);
  return Promise.resolve(listener({}, raw));
}

const asset = { symbol: 'AAPL', name: 'Apple', kind: 'stock' };

const runtime = () => {
  const rt = {
    markets: {
      getSeriesBatch: vi.fn(async () => ({ AAPL: { candles: [], fetchedAt: null, stale: false, source: null, error: 'x' } })),
      getQuoteBatch: vi.fn(async () => ({ AAPL: { price: 1, t: 1, stale: false } })),
      search: vi.fn(async () => [asset]),
      getRates: vi.fn(async () => ({ base: 'USD' as const, rates: { USD: 1 }, fetchedAt: 1, stale: false })),
    },
    portfolio: { get: vi.fn(), apply: vi.fn() },
    news: { getNews: vi.fn(async () => ({ items: [], stale: false, failed: [] })) },
  };
  return rt;
};

describe('registerMarketsHandlers', () => {
  let rt: ReturnType<typeof runtime>;
  beforeEach(() => {
    handle.mockClear();
    rt = runtime();
    registerMarketsHandlers(rt as unknown as MarketsRuntime);
  });

  it('registers every channel', () => {
    expect(handle.mock.calls.map(([ch]) => ch)).toEqual(
      expect.arrayContaining([
        CHANNELS.marketsSeries,
        CHANNELS.marketsQuotes,
        CHANNELS.marketsSearch,
        CHANNELS.marketsRates,
        CHANNELS.marketsPortfolioGet,
        CHANNELS.marketsPortfolioApply,
        CHANNELS.marketsNews,
      ]),
    );
  });

  it('wraps a series answer in an ok envelope', async () => {
    const out = await invoke(CHANNELS.marketsSeries, { assets: [asset], timescale: '1M' });
    expect(out).toMatchObject({ ok: true, value: { series: { AAPL: expect.any(Object) } } });
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await invoke(CHANNELS.marketsSeries, { assets: [], timescale: '1M' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await invoke(CHANNELS.marketsSeries, { assets: [asset], timescale: '2H' })).toMatchObject({ ok: false });
    expect(rt.markets.getSeriesBatch).not.toHaveBeenCalled();
  });

  it('turns a thrown service error into a failure envelope', async () => {
    rt.markets.search.mockRejectedValueOnce(new Error('boom'));
    expect(await invoke(CHANNELS.marketsSearch, { query: 'x' })).toEqual({ ok: false, kind: 'error', message: 'boom' });
  });

  it('rejects an empty search and an overdrawn-looking op shape before reaching the store', async () => {
    expect(await invoke(CHANNELS.marketsSearch, { query: '  ' })).toMatchObject({ ok: false });
    expect(await invoke(CHANNELS.marketsPortfolioApply, { op: 'withdraw', currency: 'USD', amount: -1 })).toMatchObject({ ok: false });
    expect(rt.portfolio.apply).not.toHaveBeenCalled();
  });

  it('maps a refused portfolio op to a failure message', async () => {
    rt.portfolio.apply.mockResolvedValueOnce({ ok: false, message: 'Insufficient balance' });
    expect(await invoke(CHANNELS.marketsPortfolioApply, { op: 'withdraw', currency: 'USD', amount: 5 })).toEqual({
      ok: false,
      kind: 'error',
      message: 'Insufficient balance',
    });
  });

  it('returns the portfolio on success', async () => {
    const value = { version: 1, balances: {}, holdings: [], transactions: [], watchlist: [], extraAssets: [] };
    rt.portfolio.get.mockResolvedValueOnce(value);
    expect(await invoke(CHANNELS.marketsPortfolioGet)).toEqual({ ok: true, value });
  });

  it('applies the news default limit', async () => {
    await invoke(CHANNELS.marketsNews, { sources: [{ kind: 'keyword', query: 'fed' }] });
    expect(rt.news.getNews).toHaveBeenCalledWith([{ kind: 'keyword', query: 'fed' }], 60);
  });
});
