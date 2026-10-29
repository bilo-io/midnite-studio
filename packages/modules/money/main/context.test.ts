// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain and a temp vault.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { financeManifest } from '@midnite/studio-feature-finance/main';
import { createFakeCipher, createVaultGrants, startTestVaultHost, testPairingIdentity, type TestVaultHost, type VaultAuthorize } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerMoneyHandlers } from './context';

const KEY = 'finance.twelveData';
const SECRET = 'TD-VAULT-SECRET';
/** Money's own pairing key — each test's host is fresh, so it binds on the first connection. */
const PAIRING_KEY = testPairingIdentity();

let dir: string;
let host: TestVaultHost | null = null;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'money-main-'));
  mkdirSync(join(dir, 'runtime'));
});
afterEach(async () => {
  await host?.close();
  host = null;
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Registers Money over the runtime host (Studio's side, its own fake cipher) holding the key, with a
 * transport that records every URL. Money itself holds no cipher.
 */
async function setup(authorize?: VaultAuthorize, fetcherOverride?: Parameters<typeof registerMoneyHandlers>[0]['fetcher']) {
  host = await startTestVaultHost({
    runtimeDirectory: join(dir, 'runtime'),
    cipher: createFakeCipher(),
    ...(authorize ? { authorize } : {}),
  });
  await host.studio.set('secrets', KEY, SECRET);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const urls: string[] = [];
  const stop = registerMoneyHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: () => undefined },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: join(dir, 'userData'),
    vaultDirectory: join(dir, 'runtime'),
    // This app's pairing key, as its own pairing.ts would keep it — a random seed, no keychain.
    pairing: () => PAIRING_KEY,
    fetcher: fetcherOverride ?? (async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ close: '10', currency: 'USD', base: 'USD', rates: {} }) };
    }),
  });
  stop();
  return { handlers, urls, studio: host.studio };
}

describe('registerMoneyHandlers', () => {
  it('registers the finance channels (accounts included) plus secretsHas, and nothing else', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual([...financeManifest.ipc, CHANNELS.secretsHas].sort());
    expect(handlers.has(CHANNELS.secretsGet)).toBe(false);
    expect(handlers.has(CHANNELS.secretsSet)).toBe(false);
  });

  it('is denied the key by default — no grant, no key', async () => {
    const { handlers, urls } = await setup();
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: false });
    await handlers.get(CHANNELS.financeQuote)?.({}, { kind: 'stock', symbol: 'AAPL' });
    expect(urls.filter((u) => u.includes('twelvedata'))).toEqual([]);
  });

  it('reads the key once the user grants Money the secrets namespace in Vault', async () => {
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('money', 'secrets', [KEY])).toBe(true);
    const { handlers } = await setup();
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: true });
  });

  it('reads the market-data key from the vault as money, and no answer contains it', async () => {
    const { handlers, urls } = await setup(() => true);
    const quote = await handlers.get(CHANNELS.financeQuote)?.({}, { kind: 'stock', symbol: 'AAPL' });
    expect(quote).toEqual({ ok: true, value: { price: 10, currency: 'USD' } });
    expect(urls.some((u) => u.includes(`apikey=${SECRET}`))).toBe(true);
    expect(JSON.stringify(quote)).not.toContain(SECRET);
    const has = await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY });
    expect(has).toEqual({ hasKey: true });
    expect(JSON.stringify(has)).not.toContain(SECRET);
  });

  it('answers a missing key, without fetching, when the vault refuses money', async () => {
    const deny: VaultAuthorize = (access) => access.appId !== 'money';
    const { handlers, urls } = await setup(deny);
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: KEY })).toEqual({ hasKey: false });
    const quote = await handlers.get(CHANNELS.financeQuote)?.({}, { kind: 'stock', symbol: 'AAPL' });
    expect(quote).toMatchObject({ ok: false, message: expect.stringContaining('Twelve Data API key') });
    expect(urls.filter((u) => u.includes('twelvedata'))).toEqual([]);
  });

  it('answers secretsHas false for any other secret', async () => {
    const { handlers } = await setup();
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: 'ollama.apiKey' })).toEqual({ hasKey: false });
  });
});

describe('brokerage accounts in Money', () => {
  const ALPACA_SECRET = 'alpaca-private-secret-value';
  const fields = { apiKeyId: 'PKMONEYTEST', apiSecret: ALPACA_SECRET };
  const alpacaFetcher: NonNullable<Parameters<typeof registerMoneyHandlers>[0]['fetcher']> = async (url) => {
    const path = new URL(url).pathname;
    const body: unknown =
      path === '/v2/account' ? { currency: 'USD', cash: '500', buying_power: '500' } : path === '/v2/positions' ? [] : { timestamp: [], equity: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };

  it('cannot store a credential until the user grants Money the secrets namespace', async () => {
    const { handlers } = await setup(undefined, alpacaFetcher);
    const out = await handlers.get(CHANNELS.financeAccountAdd)?.({}, { connector: 'alpaca', fields, label: 'Paper' });
    expect(out).toMatchObject({ ok: false });
    expect(JSON.stringify(out)).not.toContain(ALPACA_SECRET);
    expect(await handlers.get(CHANNELS.financeAccountsList)?.({}, undefined)).toMatchObject({ ok: true, value: { accounts: [] } });
  });

  it('with a grant: stores the credential encrypted, answers without it, and removal deletes it', async () => {
    const { handlers, studio } = await setup(undefined, alpacaFetcher);
    expect(createVaultGrants({ directory: join(dir, 'runtime') }).set('money', 'secrets', '*')).toBe(true);
    const added = await handlers.get(CHANNELS.financeAccountAdd)?.({}, { connector: 'alpaca', fields, label: 'Paper' });
    expect(added).toMatchObject({ ok: true });
    const id = (added as { value: { account: { id: string } } }).value.account.id;
    const snaps = await handlers.get(CHANNELS.financeAccountSnapshots)?.({}, { refresh: true });
    expect(snaps).toMatchObject({ ok: true, value: { snapshots: [{ totalUsd: 500, error: null }] } });
    // Nothing the renderer is told contains the secret; the vault file holds ciphertext only.
    expect(JSON.stringify([added, snaps, await handlers.get(CHANNELS.financeAccountsList)?.({}, undefined)])).not.toContain(ALPACA_SECRET);
    // It landed in the host's vault — the one Studio reads — as ciphertext.
    expect(await studio.has('secrets', `finance.account.alpaca.${id}.apiSecret`)).toBe(true);
    expect(readFileSync(join(dir, 'runtime', 'secrets.vault.json'), 'utf8')).not.toContain(ALPACA_SECRET);

    expect(await handlers.get(CHANNELS.financeAccountRemove)?.({}, { id })).toEqual({ ok: true, value: { removed: true } });
    expect(await studio.has('secrets', `finance.account.alpaca.${id}.apiSecret`)).toBe(false);
  });

  it('the secrets channel still cannot name an account credential', async () => {
    const { handlers } = await setup();
    const out = await handlers.get(CHANNELS.secretsHas)?.({}, { key: 'finance.account.alpaca.alpaca-1.apiSecret' });
    expect(out).toEqual({ hasKey: false });
  });
});
