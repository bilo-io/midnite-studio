import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MarketPortfolioSchema, replayTransactions } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPortfolioStore } from './portfolio-store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'portfolio-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const make = (price: number | null = 100) => {
  let n = 0;
  return createPortfolioStore({
    directory: dir,
    now: () => 1_800_000_000_000,
    newId: () => `id-${++n}`,
    getRates: async () => ({ USD: 1, ZAR: 20 }),
    getPrice: async () => price ?? undefined,
  });
};

describe('portfolio store', () => {
  it('seeds a starter portfolio on first read and writes it to disk', async () => {
    const portfolio = await make().get();
    expect(portfolio.watchlist).toContain('BTC');
    expect(portfolio.transactions.length).toBeGreaterThan(5);
    const onDisk = MarketPortfolioSchema.parse(JSON.parse(await readFile(join(dir, 'portfolio.json'), 'utf8')));
    expect(onDisk).toEqual(portfolio);
  });

  it('survives a restart: a second store reads what the first wrote', async () => {
    const first = make();
    await first.apply({ op: 'deposit', currency: 'USD', amount: 123.45 });
    const second = make();
    const reloaded = await second.get();
    expect(reloaded.transactions.at(-1)).toMatchObject({ type: 'deposit', fiatAmount: 123.45 });
  });

  it('recovers from a corrupt file by reseeding rather than failing', async () => {
    await writeFile(join(dir, 'portfolio.json'), '{ nope', 'utf8');
    expect((await make().get()).balances).toBeDefined();
  });

  it('refuses an overdraft with a message and writes nothing', async () => {
    const store = make();
    const before = await store.get();
    const result = await store.apply({ op: 'withdraw', currency: 'USD', amount: 1e9 });
    expect(result).toEqual({ ok: false, message: expect.stringContaining('Insufficient') });
    expect(await store.get()).toEqual(before);
  });

  it('prices a trade itself, ignoring the renderer entirely', async () => {
    const store = make(250);
    await store.apply({ op: 'deposit', currency: 'USD', amount: 10_000 });
    const result = await store.apply({ op: 'buy', asset: { symbol: 'AAPL', name: 'Apple', kind: 'stock' }, quantity: 2, currency: 'USD' });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.transactions.at(-1)).toMatchObject({ type: 'buy', priceUsd: 250, valueUsd: 500 });
  });

  it('fails a trade when there is no price', async () => {
    const result = await make(null).apply({ op: 'buy', asset: { symbol: 'AAPL', name: 'Apple', kind: 'stock' }, quantity: 1, currency: 'USD' });
    expect(result).toEqual({ ok: false, message: expect.stringContaining('No price') });
  });

  it('serialises concurrent writes so none is lost', async () => {
    const store = make();
    const start = (await store.get()).balances.USD ?? 0;
    await Promise.all(Array.from({ length: 10 }, () => store.apply({ op: 'deposit', currency: 'USD', amount: 10 })));
    const after = await store.get();
    expect(after.balances.USD).toBe(start + 100);
    expect(new Set(after.transactions.map((t) => t.id)).size).toBe(after.transactions.length);
  });

  it('keeps balances, holdings and the log in agreement through a mixed session', async () => {
    const store = make(10);
    await store.apply({ op: 'deposit', currency: 'ZAR', amount: 5000 });
    await store.apply({ op: 'buy', asset: { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock' }, quantity: 3, currency: 'ZAR' });
    await store.apply({ op: 'sell', asset: { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock' }, quantity: 1, currency: 'USD' });
    await store.apply({ op: 'withdraw', currency: 'ZAR', amount: 100 });
    const p = await store.get();
    const replay = replayTransactions(p.transactions);
    expect(replay.balances).toEqual(p.balances);
    expect(replay.holdings).toEqual(Object.fromEntries(p.holdings.map((h) => [h.symbol, h.quantity])));
  });
});
