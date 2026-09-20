import { afterEach, describe, expect, it, vi } from 'vitest';

import { getHistory, getQuote, searchAssets, StockApiKeyMissingError } from './finance-api';

function stubFinance(
  finance: Partial<{
    search: ReturnType<typeof vi.fn>;
    quote: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
  }>,
): void {
  vi.stubGlobal('window', {
    midniteStudio: {
      finance: {
        search: finance.search ?? vi.fn(async () => ({ ok: true as const, value: [] })),
        quote: finance.quote ?? vi.fn(async () => ({ ok: true as const, value: { price: 0, currency: 'USD' } })),
        history: finance.history ?? vi.fn(async () => ({ ok: true as const, value: [] })),
      },
      secrets: {
        get: vi.fn(async () => ({ value: null })),
        set: vi.fn(async () => {}),
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crypto (proxied through main)', () => {
  it('searches coins', async () => {
    stubFinance({
      search: vi.fn(async () => ({
        ok: true as const,
        value: [{ kind: 'crypto' as const, symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
      })),
    });
    const results = await searchAssets('crypto', 'bit');
    expect(results).toEqual([{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }]);
  });

  it('quotes a coin', async () => {
    stubFinance({
      quote: vi.fn(async () => ({ ok: true as const, value: { price: 50000, currency: 'USD' } })),
    });
    const quote = await getQuote('crypto', 'bitcoin');
    expect(quote).toEqual({ price: 50000, currency: 'USD' });
  });

  it('returns ordered history points', async () => {
    stubFinance({
      history: vi.fn(async () => ({
        ok: true as const,
        value: [
          { t: 1000, c: 100 },
          { t: 2000, c: 110 },
        ],
      })),
    });
    const points = await getHistory('crypto', 'bitcoin');
    expect(points).toEqual([
      { t: 1000, c: 100 },
      { t: 2000, c: 110 },
    ]);
  });
});

describe('stocks (Twelve Data key in main)', () => {
  it('surfaces a missing key from main as StockApiKeyMissingError', async () => {
    const failure = {
      ok: false as const,
      kind: 'error' as const,
      message: 'Stocks need a Twelve Data API key — add one below.',
    };
    stubFinance({
      quote: vi.fn(async () => failure),
      search: vi.fn(async () => failure),
      history: vi.fn(async () => failure),
    });
    await expect(getQuote('stock', 'AAPL')).rejects.toBeInstanceOf(StockApiKeyMissingError);
    await expect(searchAssets('stock', 'AAPL')).rejects.toBeInstanceOf(StockApiKeyMissingError);
    await expect(getHistory('stock', 'AAPL')).rejects.toBeInstanceOf(StockApiKeyMissingError);
  });

  it('quotes a symbol through main', async () => {
    stubFinance({
      quote: vi.fn(async () => ({ ok: true as const, value: { price: 193.5, currency: 'USD' } })),
    });
    const quote = await getQuote('stock', 'AAPL');
    expect(quote).toEqual({ price: 193.5, currency: 'USD' });
  });

  it('surfaces a provider error from main', async () => {
    stubFinance({
      quote: vi.fn(async () => ({
        ok: false as const,
        kind: 'error' as const,
        message: 'invalid symbol',
      })),
    });
    await expect(getQuote('stock', 'NOPE')).rejects.toThrow('invalid symbol');
  });
});
