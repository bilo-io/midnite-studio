// vitest, not Playwright: two main processes meet on a Unix socket in a temp dir; no browser involved.
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { vaultHostSocketPath } from '../../host/host-record';
import { createFakeCipher, startTestVaultHost, testPairingIdentity, type TestVaultHost } from '../testing';
import { createVaultService, VaultAccessDeniedError } from '../vault-service';
import { connectRuntimeVault, VaultHostUnavailableError, type RemoteVault } from './client';
import type { PairingIdentity } from './pairing';
import { createPairingStore } from './pairing-store';
import { startVaultHost } from './server';

/**
 * One login, seen by two apps: Studio (the host) stores a value with *its* cipher; Coder (a guest,
 * another process in production) reads it over the host's socket and never holds a cipher at all.
 * Every path is a temp dir, every cipher a fake — no keychain, no real socket.
 */

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

const KEY = 'gitlab:gitlab.example.com:me';
const TOKEN = 'glpat-secret';

async function hostIn(dir: string): Promise<TestVaultHost> {
  const host = await startTestVaultHost({ runtimeDirectory: dir, cipher: createFakeCipher() });
  cleanups.push(() => host.close());
  return host;
}

type AppId = Parameters<typeof connectRuntimeVault>[0]['appId'];

/** One pairing key per app id for the whole test — what each real app keeps in its own userData. */
let keys = new Map<string, PairingIdentity>();
afterEach(() => {
  keys = new Map();
});
const keyOf = (appId: string): PairingIdentity => {
  let key = keys.get(appId);
  if (!key) keys.set(appId, (key = testPairingIdentity()));
  return key;
};

function guest(dir: string, appId: AppId, identity: PairingIdentity | null = keyOf(appId)): RemoteVault {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(dir), appId, identity: () => identity, timeoutMs: 2000 });
  cleanups.push(() => vault.close());
  return vault;
}

const tempDir = () => mkdtempSync(join(tmpdir(), 'msr-vh-'));

describe('vault host — one login across two apps', () => {
  it('a token Studio stored is read by Coder only once Coder is granted it', async () => {
    const dir = tempDir();
    const host = await hostIn(dir);
    await host.studio.set('forge-accounts', KEY, TOKEN);
    const coder = guest(dir, 'coder');

    // Deny by default: absent, not an error, and its name is not listed.
    expect(await coder.get('forge-accounts', KEY)).toBeNull();
    expect(await coder.has('forge-accounts', KEY)).toBe(false);
    expect(await coder.keys('forge-accounts')).toEqual([]);

    expect(host.grants.set('coder', 'forge-accounts', [KEY])).toBe(true);
    expect(await coder.get('forge-accounts', KEY)).toBe(TOKEN);
    expect(await coder.has('forge-accounts', KEY)).toBe(true);
    expect(await coder.keys('forge-accounts')).toEqual([KEY]);
    expect(coder.isAvailable()).toBe(true);
  });

  it('a granted guest write lands in the host vault; an ungranted one throws the vault’s own error', async () => {
    const dir = tempDir();
    const host = await hostIn(dir);
    const money = guest(dir, 'money');

    await expect(money.set('secrets', 'twelveDataApiKey', 'k1')).rejects.toBeInstanceOf(VaultAccessDeniedError);
    host.grants.set('money', 'secrets', ['twelveDataApiKey']);
    await money.set('secrets', 'twelveDataApiKey', 'k1');
    expect(await host.studio.get('secrets', 'twelveDataApiKey')).toBe('k1');
    await money.delete('secrets', 'twelveDataApiKey');
    expect(await host.studio.has('secrets', 'twelveDataApiKey')).toBe(false);
  });

  it('refuses a socket peer that claims to be Studio, and an app id it does not know', async () => {
    const dir = tempDir();
    const host = await hostIn(dir);
    await host.studio.set('secrets', 'twelveDataApiKey', 'k1');
    expect(await guest(dir, 'studio').get('secrets', 'twelveDataApiKey')).toBeNull();
    expect(await guest(dir, 'nope' as never).get('secrets', 'twelveDataApiKey')).toBeNull();
  });

  it('lets the Vault app list names and edit grants, but never read a value', async () => {
    const dir = tempDir();
    const host = await hostIn(dir);
    await host.studio.set('forge-accounts', KEY, TOKEN);
    const vault = guest(dir, 'vault');

    expect(await vault.keys('forge-accounts')).toEqual([KEY]);
    expect(await vault.has('forge-accounts', KEY)).toBe(true);
    expect(await vault.get('forge-accounts', KEY)).toBeNull();

    expect(await vault.grants.set('coder', 'forge-accounts', '*')).toBe(true);
    expect((await vault.grants.list()).grants).toEqual({ coder: { 'forge-accounts': '*' } });
    expect(await guest(dir, 'coder').get('forge-accounts', KEY)).toBe(TOKEN);
    // Only Vault edits grants: Coder cannot widen its own.
    expect(await guest(dir, 'coder').grants.set('coder', 'secrets', '*')).toBe(false);
    expect(await vault.grants.revoke('coder')).toBe(true);
    expect(await guest(dir, 'coder').get('forge-accounts', KEY)).toBeNull();
  });
});

describe('vault host — no host, a late host, a second host', () => {
  it('with no host a guest reads absent, reports unavailable and refuses a write; a late host is found', async () => {
    const dir = tempDir();
    const coder = guest(dir, 'coder');
    expect(await coder.get('secrets', 'k')).toBeNull();
    expect(coder.isAvailable()).toBe(false);
    expect(await coder.ping()).toBe(false);
    await expect(coder.set('secrets', 'k', 'v')).rejects.toBeInstanceOf(VaultHostUnavailableError);

    const host = await hostIn(dir);
    await host.studio.set('secrets', 'k', 'v');
    host.grants.set('coder', 'secrets', '*');
    expect(await coder.get('secrets', 'k')).toBe('v');
  });

  it('mirrors the host’s keychain state, which the guest never reads itself', async () => {
    const dir = tempDir();
    const cipher = createFakeCipher();
    const host = await startTestVaultHost({ runtimeDirectory: dir, cipher });
    cleanups.push(() => host.close());
    const coder = guest(dir, 'coder');
    expect(await coder.ping()).toBe(true);
    expect(coder.isAvailable()).toBe(true);
    cipher.setAvailable(false);
    // Every reply carries the host's keychain state; any request refreshes it.
    await coder.has('secrets', 'k');
    expect(coder.isAvailable()).toBe(false);
  });

  it('a guest that loses its host reads absent, then reconnects when one is back', async () => {
    const dir = tempDir();
    const first = await startTestVaultHost({ runtimeDirectory: dir, cipher: createFakeCipher() });
    await first.studio.set('secrets', 'k', 'v');
    first.grants.set('coder', 'secrets', '*');
    const coder = guest(dir, 'coder');
    expect(await coder.get('secrets', 'k')).toBe('v');
    await first.close();
    expect(await coder.get('secrets', 'k')).toBeNull();
    await hostIn(dir);
    expect(await coder.get('secrets', 'k')).toBe('v');
  });

  it('will not take the path from a live host, and replaces a dead socket file', async () => {
    const dir = tempDir();
    await hostIn(dir);
    const service = createVaultService({ directory: dir, cipher: createFakeCipher() });
    await expect(startVaultHost({ socketPath: vaultHostSocketPath(dir), service, grants: null, pairings: createPairingStore({ hostDirectory: join(dir, 'host') }) })).rejects.toThrow(/already serving/);

    const other = tempDir();
    await hostIn(other).then((h) => h.close());
    // The closed host's path is free again (Node unlinks on close; a crash leaves a dead file).
    writeFileSync(join(other, 'host', 'vault.sock'), '');
    const again = await startVaultHost({ socketPath: vaultHostSocketPath(other), service, grants: null, pairings: createPairingStore({ hostDirectory: join(other, 'host') }) });
    cleanups.push(() => again.close());
    expect(await guest(other, 'coder').ping()).toBe(true);
  });

  it('answers a malformed line with an invalid reply instead of dropping the connection', async () => {
    const dir = tempDir();
    await hostIn(dir);
    const peer = await rawPeer(dir);
    expect(await peer.send({ id: 7, op: 'steal' })).toMatchObject({ id: 7, ok: false, error: 'invalid' });
  });
});

/** A hand-written socket peer — what a spoofer is: it reads the challenge and says whatever it likes. */
async function rawPeer(dir: string): Promise<{ nonce: string; send(line: Record<string, unknown>): Promise<Record<string, unknown>> }> {
  const socket = net.connect(vaultHostSocketPath(dir));
  cleanups.push(() => void socket.destroy());
  const lines: Record<string, unknown>[] = [];
  const waiters: ((line: Record<string, unknown>) => void)[] = [];
  let tail = '';
  socket.on('data', (chunk) => {
    tail += chunk.toString('utf8');
    const parts = tail.split('\n');
    tail = parts.pop() ?? '';
    for (const part of parts.filter(Boolean)) {
      const line = JSON.parse(part) as Record<string, unknown>;
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lines.push(line);
    }
  });
  const next = () => new Promise<Record<string, unknown>>((resolve) => (lines.length > 0 ? resolve(lines.shift()!) : waiters.push(resolve)));
  const challenge = await next();
  expect(challenge).toMatchObject({ t: 'challenge' });
  return {
    nonce: challenge['nonce'] as string,
    send: (line) => {
      socket.write(`${JSON.stringify(line)}\n`);
      return next();
    },
  };
}

describe('vault host — pairing', () => {
  const TOKEN_KEY = 'github:github.com:octo';

  async function grantedHost(dir: string): Promise<TestVaultHost> {
    const host = await hostIn(dir);
    await host.studio.set('forge-accounts', TOKEN_KEY, 'ghp-secret');
    host.grants.set('coder', 'forge-accounts', '*');
    return host;
  }

  it('binds an app on its first hello, and serves it from then on', async () => {
    const dir = tempDir();
    const host = await grantedHost(dir);
    expect(host.pairings.list().apps).toEqual([]);
    expect(await guest(dir, 'coder').get('forge-accounts', TOKEN_KEY)).toBe('ghp-secret');
    expect(host.pairings.list().apps).toEqual([expect.objectContaining({ appId: 'coder', conflict: null })]);
    // A later connection with the same key is the same app.
    expect(await guest(dir, 'coder').get('forge-accounts', TOKEN_KEY)).toBe('ghp-secret');
  });

  it('refuses a spoofer without the key — granted or not, nothing is served', async () => {
    const dir = tempDir();
    await grantedHost(dir);
    expect(await guest(dir, 'coder').ping()).toBe(true);
    const spoofer = guest(dir, 'coder', testPairingIdentity());
    expect(await spoofer.get('forge-accounts', TOKEN_KEY)).toBeNull();
    expect(spoofer.refusal()).toMatch(/pairing conflict/);
    await expect(spoofer.set('forge-accounts', TOKEN_KEY, 'x')).rejects.toBeInstanceOf(VaultHostUnavailableError);

    // A raw peer that skips the hello, or names an app without proving it, gets nothing either.
    const raw = await rawPeer(dir);
    expect(await raw.send({ id: 1, appId: 'coder', op: 'get', namespace: 'forge-accounts', key: TOKEN_KEY })).toMatchObject({ ok: false, error: 'unpaired' });
    expect(await raw.send({ id: 2, appId: 'coder', op: 'hello', publicKey: keyOf('coder').publicKey, proof: 'AAAA' })).toMatchObject({ ok: false, error: 'unpaired' });
  });

  it('refuses a replayed hello: the proof was for another connection’s nonce', async () => {
    const dir = tempDir();
    await grantedHost(dir);
    const key = keyOf('coder');
    const first = await rawPeer(dir);
    const hello = { id: 0, appId: 'coder', op: 'hello', publicKey: key.publicKey, proof: key.prove('coder', first.nonce) };
    expect(await first.send(hello)).toMatchObject({ ok: true });
    const replay = await rawPeer(dir);
    expect(replay.nonce).not.toBe(first.nonce);
    expect(await replay.send(hello)).toMatchObject({ ok: false, error: 'unpaired' });
    expect(await replay.send({ id: 1, appId: 'coder', op: 'get', namespace: 'forge-accounts', key: TOKEN_KEY })).toMatchObject({ ok: false, error: 'unpaired' });
  });

  it('a proof for one app is not one for another, and a connection serves only the app it paired as', async () => {
    const dir = tempDir();
    await grantedHost(dir);
    const key = keyOf('money');
    const peer = await rawPeer(dir);
    expect(await peer.send({ id: 0, appId: 'coder', op: 'hello', publicKey: key.publicKey, proof: key.prove('money', peer.nonce) })).toMatchObject({ ok: false });
    expect(await peer.send({ id: 1, appId: 'money', op: 'hello', publicKey: key.publicKey, proof: key.prove('money', peer.nonce) })).toMatchObject({ ok: true });
    expect(await peer.send({ id: 2, appId: 'coder', op: 'get', namespace: 'forge-accounts', key: TOKEN_KEY })).toMatchObject({ ok: false, error: 'unpaired' });
  });

  it('refuses a granted app that has not paired', async () => {
    const dir = tempDir();
    await grantedHost(dir);
    const noKey = guest(dir, 'coder', null);
    expect(await noKey.get('forge-accounts', TOKEN_KEY)).toBeNull();
    expect(noKey.refusal()).toMatch(/no pairing key/);
  });

  it('surfaces a conflict to the Vault app; Unpair (Vault only, Vault paired) lets the next hello re-bind', async () => {
    const dir = tempDir();
    const host = await grantedHost(dir);
    // A spoofer bound "coder" first (the TOFU window): the real Coder is now the one refused.
    expect(await guest(dir, 'coder', testPairingIdentity()).ping()).toBe(true);
    const real = guest(dir, 'coder');
    expect(await real.get('forge-accounts', TOKEN_KEY)).toBeNull();

    const vault = guest(dir, 'vault');
    expect((await vault.pairing.list()).apps).toEqual(
      expect.arrayContaining([expect.objectContaining({ appId: 'coder', conflict: expect.objectContaining({ count: 1 }) })]),
    );
    expect(await real.pairing.unpair('coder')).toBe(false); // only Vault unpairs
    expect(await guest(dir, 'vault', null).pairing.unpair('coder')).toBe(false); // and Vault must be paired
    expect(await vault.pairing.unpair('coder')).toBe(true);
    expect(await real.get('forge-accounts', TOKEN_KEY)).toBe('ghp-secret');
    expect(host.pairings.list().apps.find((a) => a.appId === 'coder')?.conflict).toBeNull();
  });

  it('keeps the bindings user-only on disk, and public keys only', async () => {
    const dir = tempDir();
    await grantedHost(dir);
    await guest(dir, 'coder').ping();
    const file = join(dir, 'host', 'pairings.json');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'host')).mode & 0o777).toBe(0o700);
    expect(readFileSync(file, 'utf8')).toContain(keyOf('coder').publicKey);
  });
});
