import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MarketAsset } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDiskCache } from './disk-cache';
import type { Fetcher } from './http';
import { createMarketsService, SERIES_TTL_MS } from './markets-service';

/** A fake network: url-substring → response. Nothing here can reach a real host. */
type Route = { match: string; status?: number; body: unknown };

function fakeFetcher(routes: Route[]) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return { ok: false, status: 404, text: async () => '' };
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof route.body === 'string' ? route.body : JSON.stringify(route.body)),
    };
  };
  return { fetcher, calls };
}

const cnbc = (n = 3) => ({
  barData: {
    priceBars: Array.from({ length: n }, (_, i) => ({
      open: String(100 + i),
      high: String(103 + i),
      low: String(99 + i),
      close: String(102 + i),
      volume: 10,
      tradeTimeinMills: 1_700_000_000_000 + i * 86_400_000,
    })),
  },
});

const binance = [[1_700_000_000_000, '50000', '51000', '49000', '50500', '10', 0]];
const AAPL: MarketAsset = { symbol: 'AAPL', name: 'Apple', kind: 'stock' };
const BTC: MarketAsset = { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto' };

let dir: string;
let clock: number;
const now = () => clock;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'markets-'));
  clock = 1_800_000_000_000;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const make = (routes: Route[]) => {
  const net = fakeFetcher(routes);
  const service = createMarketsService({ fetcher: net.fetcher, cache: createDiskCache(dir, now), now });
  return { ...net, service };
};

describe('series', () => {
  it('serves a stock from CNBC and caches it for the TTL', async () => {
    const { service, calls } = make([{ match: 'cnbc.com', body: cnbc() }]);
    const first = await service.getSeries(AAPL, '1M');
    expect(first).toMatchObject({ stale: false, source: 'CNBC' });
    expect(first.candles).toHaveLength(3);

    await service.getSeries(AAPL, '1M');
    expect(calls).toHaveLength(1);

    clock += SERIES_TTL_MS['1M'] + 1;
    await service.getSeries(AAPL, '1M');
    expect(calls).toHaveLength(2);
  });

  it('routes crypto to Binance with the right pair', async () => {
    const { service, calls } = make([{ match: 'binance.vision', body: binance }]);
    const out = await service.getSeries(BTC, '1D');
    expect(out.source).toBe('Binance');
    expect(calls[0]).toContain('symbol=BTCUSDT');
  });

  it('falls through to the second provider when the first fails', async () => {
    const yahoo = { chart: { result: [{ timestamp: [1_700_000_000], indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [1] }] } }] } };
    const { service } = make([
      { match: 'cnbc.com', status: 500, body: 'boom' },
      { match: 'yahoo.com', body: yahoo },
    ]);
    const out = await service.getSeries(AAPL, '1W');
    expect(out).toMatchObject({ source: 'Yahoo Finance', stale: false });
  });

  it('serves the stale cache, flagged, when every provider is down', async () => {
    const up = make([{ match: 'cnbc.com', body: cnbc() }]);
    await up.service.getSeries(AAPL, '1M');

    clock += SERIES_TTL_MS['1M'] * 10;
    const down = make([{ match: 'cnbc.com', status: 429, body: 'slow down' }, { match: 'yahoo.com', status: 429, body: '' }]);
    const out = await down.service.getSeries(AAPL, '1M');
    expect(out.stale).toBe(true);
    expect(out.candles).toHaveLength(3);
    expect(out.error).toBeUndefined();
  });

  it('reports an error — not a throw — when there is no data and no cache', async () => {
    const { service } = make([]);
    const out = await service.getSeries(AAPL, '1M');
    expect(out.candles).toEqual([]);
    expect(out.error).toBeTruthy();
  });

  it('backs a rate-limited provider off instead of hammering it', async () => {
    const { service, calls } = make([{ match: 'cnbc.com', status: 429, body: '' }]);
    await service.getSeries(AAPL, '1M');
    const before = calls.filter((c) => c.includes('cnbc')).length;
    await service.getSeries({ symbol: 'MSFT', name: 'Microsoft', kind: 'stock' }, '1M');
    expect(calls.filter((c) => c.includes('cnbc')).length).toBe(before);
  });

  it('shares one fetch between concurrent callers', async () => {
    const { service, calls } = make([{ match: 'cnbc.com', body: cnbc() }]);
    await Promise.all([service.getSeries(AAPL, '3M'), service.getSeries(AAPL, '3M')]);
    expect(calls).toHaveLength(1);
  });

  it('batches by symbol, de-duplicating', async () => {
    const { service, calls } = make([{ match: 'cnbc.com', body: cnbc() }]);
    const out = await service.getSeriesBatch([AAPL, AAPL], '1M');
    expect(Object.keys(out)).toEqual(['AAPL']);
    expect(calls).toHaveLength(1);
  });
});

describe('quotes', () => {
  it('takes the last close of the one-day series, in USD', async () => {
    const { service } = make([{ match: 'cnbc.com', body: cnbc(3) }]);
    const quotes = await service.getQuoteBatch([AAPL]);
    expect(quotes.AAPL).toMatchObject({ price: 104, stale: false });
  });

  it('says why when there is no price', async () => {
    const { service } = make([]);
    expect((await service.getQuoteBatch([AAPL])).AAPL).toMatchObject({ price: null, error: expect.any(String) });
  });
});

describe('rates', () => {
  const table = { rates: { USD: 1, EUR: 0.9, ZAR: 18, GBP: 0.8 } };

  it('fetches, caches for an hour, then refreshes', async () => {
    const { service, calls } = make([{ match: 'open.er-api.com', body: table }]);
    expect((await service.getRates()).rates.ZAR).toBe(18);
    await service.getRates();
    expect(calls).toHaveLength(1);
    clock += 61 * 60_000;
    await service.getRates();
    expect(calls).toHaveLength(2);
  });

  it('falls back to Frankfurter, then to the stale cache, then to USD alone', async () => {
    const viaFrankfurter = make([{ match: 'frankfurter', body: table }]);
    expect((await viaFrankfurter.service.getRates()).stale).toBe(false);

    clock += 2 * 60 * 60_000;
    const down = make([]);
    expect(await down.service.getRates()).toMatchObject({ stale: true, rates: table.rates });

    await rm(dir, { recursive: true, force: true });
    expect(await down.service.getRates()).toEqual({ base: 'USD', rates: { USD: 1 }, fetchedAt: null, stale: true });
  });
});

describe('search', () => {
  it('puts catalogue matches first and merges remote hits without duplicates', async () => {
    const { service } = make([
      { match: 'nasdaq.com', body: { data: [{ symbol: 'TSLA', name: 'Tesla, Inc. Common Stock', asset: 'STOCKS' }, { symbol: 'TSM', name: 'Taiwan Semi', asset: 'STOCKS' }] } },
      { match: 'coingecko.com', body: { coins: [{ id: 'tesla-inu', name: 'Tesla Inu', symbol: 'tsi' }] } },
    ]);
    const out = await service.search('tes');
    expect(out[0]).toEqual({ symbol: 'TSLA', name: 'Tesla', kind: 'stock' });
    expect(out.filter((a) => a.symbol === 'TSLA')).toHaveLength(1);
    expect(out.map((a) => a.symbol)).toContain('TSI');
  });

  it('still answers from the catalogue when the network is down', async () => {
    const { service } = make([]);
    expect((await service.search('btc')).map((a) => a.symbol)).toEqual(['BTC']);
  });

  it('does not remember a failed lookup', async () => {
    const down = make([]);
    await down.service.search('zzz');
    const spy = vi.fn();
    await down.service.search('zzz').then(spy);
    expect(down.calls.filter((c) => c.includes('nasdaq')).length).toBe(2);
  });
});
