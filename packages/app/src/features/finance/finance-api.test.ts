import { afterEach, describe, expect, it, vi } from 'vitest';

import { getHistory, getQuote, searchAssets, StockApiKeyMissingError } from './finance-api';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crypto (CoinGecko, keyless)', () => {
  it('searches coins', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }] }),
      ),
    );
    const results = await searchAssets('crypto', 'bit', '');
    expect(results).toEqual([{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }]);
  });

  it('quotes a coin from market_data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ market_data: { current_price: { usd: 50000 } } }),
      ),
    );
    const quote = await getQuote('crypto', 'bitcoin', '');
    expect(quote).toEqual({ price: 50000, currency: 'USD' });
  });

  it('turns a market_chart response into ordered points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          prices: [
            [1000, 100],
            [2000, 110],
          ],
        }),
      ),
    );
    const points = await getHistory('crypto', 'bitcoin', '');
    expect(points).toEqual([
      { t: 1000, c: 100 },
      { t: 2000, c: 110 },
    ]);
  });
});

describe('stocks (Twelve Data, keyed)', () => {
  it('refuses without an API key', async () => {
    await expect(getQuote('stock', 'AAPL', '')).rejects.toBeInstanceOf(StockApiKeyMissingError);
    await expect(searchAssets('stock', 'AAPL', '')).rejects.toBeInstanceOf(StockApiKeyMissingError);
    await expect(getHistory('stock', 'AAPL', '')).rejects.toBeInstanceOf(StockApiKeyMissingError);
  });

  it('quotes a symbol given a key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ close: '193.5', currency: 'USD' })),
    );
    const quote = await getQuote('stock', 'AAPL', 'key');
    expect(quote).toEqual({ price: 193.5, currency: 'USD' });
  });

  it('surfaces a Twelve Data error payload as a thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'error', message: 'invalid symbol' })),
    );
    await expect(getQuote('stock', 'NOPE', 'key')).rejects.toThrow('invalid symbol');
  });

  it('reverses the newest-first time series into oldest-first points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          values: [
            { datetime: '2026-01-02', close: '110' },
            { datetime: '2026-01-01', close: '100' },
          ],
        }),
      ),
    );
    const points = await getHistory('stock', 'AAPL', 'key');
    expect(points.map((p) => p.c)).toEqual([100, 110]);
  });
});
