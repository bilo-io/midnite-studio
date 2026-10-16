// @vitest-environment node
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import type { Fetcher } from '../markets/http';
import { createAccountsService, scrub, type CredentialStore } from './accounts-service';

const SECRET = 'alpaca-secret-value-xyz';
const KEY = 'PKTESTKEYID123';
const FIELDS = { apiKeyId: KEY, apiSecret: SECRET };

const FIXTURES: Record<string, unknown> = {
  'GET /v2/account': { currency: 'USD', cash: '1000', buying_power: '1000' },
  'GET /v2/positions': [{ symbol: 'AAPL', qty: '1', market_value: '1000', cost_basis: '900', unrealized_pl: '100' }],
  'GET /v2/account/portfolio/history': { timestamp: [1, 2], equity: [1900, 2000] },
};

/** A fake vault (a Map) and a fixture transport; nothing here can reach the keychain or the network. */
function harness() {
  const vault = new Map<string, string>();
  const credentials: CredentialStore = {
    get: async (n) => vault.get(n) ?? null,
    set: async (n, v) => void vault.set(n, v),
    delete: async (n) => void vault.delete(n),
  };
  const calls: string[] = [];
  let failing: ((path: string) => number | null) | null = null;
  const fetcher: Fetcher = async (url, init) => {
    const u = new URL(url);
    const key = `${init?.method ?? 'GET'} ${u.pathname}`;
    calls.push(key);
    const status = failing?.(u.pathname) ?? 200;
    if (!(key in FIXTURES)) throw new Error(`unrecorded: ${key}`);
    return { ok: status < 400, status, text: async () => JSON.stringify(FIXTURES[key]) };
  };
  return { vault, credentials, calls, fetcher, failWith: (f: typeof failing) => (failing = f) };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'finance-accounts-'));
});

describe('accounts service', () => {
  it('verifies, stores credentials in the vault only, and persists non-secret metadata', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher, newId: () => 'alpaca-1', now: () => 5 });
    const account = await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    expect(account).toEqual({ id: 'alpaca-1', connector: 'alpaca', label: 'Paper', environment: 'paper', createdAt: 5 });
    expect([...h.vault.keys()].sort()).toEqual(['finance.account.alpaca.alpaca-1.apiKeyId', 'finance.account.alpaca.alpaca-1.apiSecret']);
    // The metadata file on disk holds no credential value.
    const onDisk = await Promise.all((await readdir(dir)).map((f) => readFile(join(dir, f), 'utf8')));
    expect(onDisk.join('')).not.toContain(SECRET);
    expect(onDisk.join('')).not.toContain(KEY);
  });

  it('stores nothing when the connection test fails', async () => {
    const h = harness();
    h.failWith(() => 403);
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher });
    await expect(svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'x' })).rejects.toThrow(/rejected the credentials/);
    expect(h.vault.size).toBe(0);
    expect((await svc.list()).accounts).toEqual([]);
  });

  it('refuses missing and unexpected credential fields', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher });
    await expect(svc.test({ connector: 'alpaca', environment: 'paper', fields: { apiKeyId: KEY } })).rejects.toThrow('API secret is required');
    await expect(svc.test({ connector: 'alpaca', environment: 'paper', fields: { ...FIELDS, extra: 'x' } })).rejects.toThrow('unexpected field');
    expect(h.calls).toEqual([]);
  });

  it('no response — list, snapshots, test — carries a credential value', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    const answers = JSON.stringify([
      await svc.list(),
      await svc.snapshots({ refresh: true }),
      await svc.test({ connector: 'alpaca', environment: 'paper', fields: FIELDS }),
    ]);
    expect(answers).not.toContain(SECRET);
    expect(answers).not.toContain(KEY);
  });

  it('derives balances, allocation and performance in a snapshot', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    const [snap] = await svc.snapshots();
    expect(snap?.error).toBeNull();
    expect(snap?.totalUsd).toBe(2000);
    expect(snap?.allocation.map((s) => [s.label, s.weight])).toEqual([['AAPL', 0.5], ['USD', 0.5]]);
    expect(snap?.performance).toMatchObject({ changeUsd: 100 });
  });

  it('serves a cached snapshot within the TTL and refetches after it, or on refresh', async () => {
    const h = harness();
    let clock = 0;
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher, now: () => clock, ttlMs: 1000 });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    await svc.snapshots();
    const afterFirst = h.calls.length;
    await svc.snapshots();
    expect(h.calls.length).toBe(afterFirst);
    clock = 2000;
    await svc.snapshots();
    expect(h.calls.length).toBeGreaterThan(afterFirst);
    const afterExpiry = h.calls.length;
    await svc.snapshots({ refresh: true });
    expect(h.calls.length).toBeGreaterThan(afterExpiry);
  });

  it('a failing account answers its own error arm and never blanks the others', async () => {
    const h = harness();
    const ids = ['alpaca-a', 'alpaca-b'];
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher, newId: () => ids.shift() as string });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'A' });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: { apiKeyId: 'OTHERKEY1234', apiSecret: 'other-secret-9876' }, label: 'B' });
    // Account B's key is rejected; A's is fine. The transport can't tell them apart by URL, so
    // reject by the credential the connector sent.
    const base = h.fetcher;
    const picky: Fetcher = async (url, init) =>
      init?.headers?.['APCA-API-KEY-ID'] === 'OTHERKEY1234' ? { ok: false, status: 401, text: async () => '{}' } : base(url, init);
    const svc2 = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: picky });
    const snaps = await svc2.snapshots({ refresh: true });
    const byId = Object.fromEntries(snaps.map((s) => [s.account.id, s]));
    expect(byId['alpaca-a']?.error).toBeNull();
    expect(byId['alpaca-a']?.totalUsd).toBe(2000);
    expect(byId['alpaca-b']?.error).toMatch(/rejected the credentials/);
    expect(byId['alpaca-b']?.balances).toEqual([]);
  });

  it('a transient failure keeps the last good numbers beside the error', async () => {
    const h = harness();
    let clock = 0;
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher, now: () => clock, ttlMs: 10 });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    await svc.snapshots();
    h.failWith(() => 429);
    clock = 100;
    const [snap] = await svc.snapshots();
    expect(snap?.error).toMatch(/rate limiting/);
    expect(snap?.totalUsd).toBe(2000);
  });

  it('removing an account deletes its stored credentials and its metadata', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: dir, credentials: h.credentials, fetcher: h.fetcher, newId: () => 'alpaca-1' });
    await svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'Paper' });
    expect(await svc.remove('alpaca-1')).toBe(true);
    expect(h.vault.size).toBe(0);
    expect((await svc.list()).accounts).toEqual([]);
    expect(await svc.remove('alpaca-1')).toBe(false);
  });

  it('rolls the vault back when persisting the account fails after the credentials were written', async () => {
    const h = harness();
    const svc = createAccountsService({ directory: join(dir, 'a\0bad'), credentials: h.credentials, fetcher: h.fetcher });
    await expect(svc.add({ connector: 'alpaca', environment: 'paper', fields: FIELDS, label: 'x' })).rejects.toThrow();
    expect(h.vault.size).toBe(0);
  });
});

describe('scrub', () => {
  it('removes every credential value from a message', () => {
    expect(scrub(`bad key ${KEY} / ${SECRET}`, [KEY, SECRET])).toBe('bad key [redacted] / [redacted]');
  });
});
