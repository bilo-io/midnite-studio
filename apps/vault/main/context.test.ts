// @vitest-environment node
// vitest, not Playwright: handler registration over an injected ipcMain and a runtime host on a temp-dir socket.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { vaultManifest } from '@midnite/studio-feature-vault/main';
import {
  connectRuntimeVault,
  createFakeCipher,
  startTestVaultHost,
  testPairingIdentity,
  vaultHostSocketPath,
  type PairingIdentity,
  type TestVaultHost,
} from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerVaultHandlers } from './context';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

/** Vault over a runtime host (Studio's side, its own fake cipher) — or over no host at all. */
/** Vault's own pairing key. */
const VAULT_KEY = testPairingIdentity();

async function setup(options: { host?: boolean; pairing?: PairingIdentity | null } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mv-app-'));
  let host: TestVaultHost | null = null;
  if (options.host !== false) {
    host = await startTestVaultHost({ runtimeDirectory: directory, cipher: createFakeCipher() });
    cleanups.push(() => host?.close());
  }
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const on = new Set<string>();
  const registered = registerVaultHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c) => void on.add(c) },
    trashItem: async () => undefined,
    send: () => undefined,
    directory,
    pairing: () => ('pairing' in options ? (options.pairing ?? null) : VAULT_KEY),
  });
  cleanups.push(() => registered.close());
  return { handlers, on, directory, host };
}

describe('registerVaultHandlers', () => {
  it('registers exactly the manifest channels — and never secretsGet', async () => {
    const { handlers, on } = await setup();
    expect([...handlers.keys()].sort()).toEqual([...vaultManifest.ipc].sort());
    expect(handlers.has(CHANNELS.secretsGet)).toBe(false);
    expect(on.size).toBe(0);
  });

  it('stores a value through the host, encrypted, answers only that it is set, and clears it', async () => {
    const { handlers, directory, host } = await setup();
    const key = 'media.openaiApiKey';
    await handlers.get(CHANNELS.secretsSet)?.({}, { key, value: 'sk-plaintext-canary' });
    const has = await handlers.get(CHANNELS.secretsHas)?.({}, { key });
    expect(has).toEqual({ hasKey: true });
    expect(JSON.stringify(has)).not.toContain('sk-plaintext-canary');
    // Studio reads what Vault wrote — one vault.
    expect(await host?.studio.get('secrets', key)).toBe('sk-plaintext-canary');
    const file = await readFile(join(directory, 'secrets.vault.json'), 'utf8');
    expect(file).not.toContain('sk-plaintext-canary');
    await handlers.get(CHANNELS.secretsSet)?.({}, { key, value: '' });
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key })).toEqual({ hasKey: false });
  });

  it('sees the forge accounts Studio stored — names only — and edits the host’s grants', async () => {
    const { handlers, host } = await setup();
    await host?.studio.set('forge-accounts', 'github:github.com:octo', 'ghp-canary');
    const accounts = await handlers.get(CHANNELS.forgeAccounts)?.({}, {});
    expect(accounts).toMatchObject([{ id: 'github:github.com:octo', login: 'octo', hasToken: true }]);
    expect(JSON.stringify(accounts)).not.toContain('ghp-canary');

    expect(await handlers.get(CHANNELS.vaultGrantSet)?.({}, { appId: 'coder', namespace: 'forge-accounts', scope: '*' })).toEqual({ ok: true });
    expect(await handlers.get(CHANNELS.vaultGrantsList)?.({}, {})).toEqual({ grants: { coder: { 'forge-accounts': '*' } }, corrupt: false });
    expect(host?.grants.list().grants).toEqual({ coder: { 'forge-accounts': '*' } });
  });

  it('shows a pairing conflict — a second key under Coder’s name — and Unpair lets the next hello re-bind', async () => {
    const { handlers, directory, host } = await setup();
    await host?.studio.set('forge-accounts', 'github:github.com:octo', 'ghp-canary');
    host?.grants.set('coder', 'forge-accounts', '*');
    const coderAs = (key: PairingIdentity) => {
      const v = connectRuntimeVault({ socketPath: vaultHostSocketPath(directory), appId: 'coder', identity: () => key });
      cleanups.push(() => v.close());
      return v;
    };
    const realCoder = testPairingIdentity();
    expect(await coderAs(realCoder).get('forge-accounts', 'github:github.com:octo')).toBe('ghp-canary');
    // Something else, claiming Coder: refused, and Vault is told — with no key on the wire.
    expect(await coderAs(testPairingIdentity()).get('forge-accounts', 'github:github.com:octo')).toBeNull();
    const listed = (await handlers.get(CHANNELS.vaultPairingsList)?.({}, {})) as { apps: { appId: string; conflict: unknown }[] };
    expect(listed.apps.find((a) => a.appId === 'coder')?.conflict).toMatchObject({ count: 1 });
    expect(JSON.stringify(listed)).not.toContain(realCoder.publicKey);
    expect(JSON.stringify(listed)).not.toContain('ghp-canary');

    expect(await handlers.get(CHANNELS.vaultPairingUnpair)?.({}, { appId: 'coder' })).toEqual({ ok: true });
    const fresh = testPairingIdentity();
    expect(await coderAs(fresh).get('forge-accounts', 'github:github.com:octo')).toBe('ghp-canary');
    expect(await coderAs(realCoder).get('forge-accounts', 'github:github.com:octo')).toBeNull();
  });

  it('an unpaired Vault lists no pairings and can unpair nothing', async () => {
    const { handlers, host } = await setup({ pairing: null });
    host?.pairings.check('coder', 'some-key');
    expect(await handlers.get(CHANNELS.vaultPairingsList)?.({}, {})).toEqual({ apps: [] });
    expect(await handlers.get(CHANNELS.vaultPairingUnpair)?.({}, { appId: 'coder' })).toEqual({ ok: false });
    expect(host?.pairings.list().apps.map((a) => a.appId)).toEqual(['coder']);
  });

  it('with no runtime host running, lists nothing and refuses quietly rather than throwing', async () => {
    const { handlers } = await setup({ host: false });
    expect(await handlers.get(CHANNELS.forgeAccounts)?.({}, {})).toEqual([]);
    await handlers.get(CHANNELS.secretsSet)?.({}, { key: 'media.openaiApiKey', value: 'x' });
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key: 'media.openaiApiKey' })).toEqual({ hasKey: false });
    expect(await handlers.get(CHANNELS.vaultGrantSet)?.({}, { appId: 'coder', namespace: 'secrets', scope: '*' })).toEqual({ ok: false });
  });
});
