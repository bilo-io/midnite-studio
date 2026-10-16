import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeCipher, type FakeCipher } from './testing';
import {
  createVaultService,
  VAULT_NAMESPACE_IDS,
  VAULT_NAMESPACES,
  VaultAccessDeniedError,
  type VaultAccess,
} from './vault-service';

let dir: string;
let cipher: FakeCipher;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-runtime-vault-'));
  cipher = createFakeCipher();
});

const readJson = async (fileName: string): Promise<unknown> =>
  JSON.parse(await readFile(join(dir, fileName), 'utf8'));

describe('runtime vault — on-disk compatibility', () => {
  it('keeps the three file names the desktop vaults always wrote', () => {
    expect(VAULT_NAMESPACES.secrets.fileName).toBe('secrets.vault.json');
    expect(VAULT_NAMESPACES['forge-accounts'].fileName).toBe('forge-accounts.vault.json');
    expect(VAULT_NAMESPACES['db-credentials'].fileName).toBe('db-connections.vault.json');
  });

  it('reads files written in the pre-runtime format, byte for byte', async () => {
    // Exactly what Phase 76/90's vaults wrote: `{ version: 1, entries }`.
    const enc = (s: string) => Buffer.from(`enc:${s}`).toString('base64');
    await writeFile(
      join(dir, 'secrets.vault.json'),
      JSON.stringify({ version: 1, entries: { twelveDataApiKey: { encrypted: enc('td-key') } } }),
    );
    await writeFile(
      join(dir, 'forge-accounts.vault.json'),
      JSON.stringify({ version: 1, entries: { 'gitlab:gitlab.com:octocat': { encrypted: enc('glpat') } } }),
    );
    await writeFile(
      join(dir, 'db-connections.vault.json'),
      JSON.stringify({ version: 1, entries: { c1: { fingerprint: 'fp', encrypted: enc('hunter2') } } }),
    );

    const vault = createVaultService({ directory: dir, cipher }).forApp('studio');
    expect(await vault.get('secrets', 'twelveDataApiKey')).toBe('td-key');
    expect(await vault.get('forge-accounts', 'gitlab:gitlab.com:octocat')).toBe('glpat');
    expect(await vault.get('db-credentials', 'c1')).toBe('hunter2');
    expect(await vault.fingerprint('db-credentials', 'c1')).toBe('fp');
  });

  it('writes the same entry shape back: no fingerprint outside db-credentials, mode 0600', async () => {
    const vault = createVaultService({ directory: dir, cipher }).forApp('studio');
    await vault.set('secrets', 'k', 'v');
    await vault.set('db-credentials', 'c1', 'pw', { fingerprint: 'fp' });

    expect(await readJson('secrets.vault.json')).toEqual({ version: 1, entries: { k: { encrypted: expect.any(String) } } });
    expect(await readJson('db-connections.vault.json')).toEqual({
      version: 1,
      entries: { c1: { fingerprint: 'fp', encrypted: expect.any(String) } },
    });
    expect((await stat(join(dir, 'secrets.vault.json'))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(dir, 'secrets.vault.json'), 'utf8')).not.toContain('"v"');
  });

  it('ignores a db-credentials entry with no fingerprint, as the old vault did', async () => {
    await writeFile(
      join(dir, 'db-connections.vault.json'),
      JSON.stringify({ version: 1, entries: { c1: { encrypted: 'x' } } }),
    );
    const vault = createVaultService({ directory: dir, cipher }).forApp('studio');
    expect(await vault.has('db-credentials', 'c1')).toBe(false);
  });

  it('refuses a fingerprinted set without a fingerprint', async () => {
    const vault = createVaultService({ directory: dir, cipher }).forApp('studio');
    await expect(vault.set('db-credentials', 'c1', 'pw')).rejects.toThrow(/requires a fingerprint/);
  });
});

describe('runtime vault — degraded mode keeps each namespace’s old behaviour', () => {
  it('drops secrets and db passwords, holds forge tokens for the session', async () => {
    cipher.setAvailable(false);
    const vault = createVaultService({ directory: dir, cipher }).forApp('studio');
    await vault.set('secrets', 'k', 'v');
    await vault.set('db-credentials', 'c1', 'pw', { fingerprint: 'fp' });
    await vault.set('forge-accounts', 'a', 'tok');

    expect(await vault.get('secrets', 'k')).toBeNull();
    expect(await vault.get('db-credentials', 'c1')).toBeNull();
    expect(await vault.get('forge-accounts', 'a')).toBe('tok');
    expect(cipher.encrypted).toEqual([]);
  });
});

/**
 * Phase 113 Theme D item 5: "vault access from two apps". Two callers on one
 * service see one store — what one app writes, the other reads, and both give
 * the same `hasToken` answer.
 */
describe('runtime vault — two apps, one store', () => {
  it('gives two callers the same hasToken answers for every namespace', async () => {
    const service = createVaultService({ directory: dir, cipher });
    const studio = service.forApp('studio');
    const coder = service.forApp('coder');

    for (const ns of VAULT_NAMESPACE_IDS) {
      expect(await studio.has(ns, 'k')).toBe(false);
      expect(await coder.has(ns, 'k')).toBe(false);
    }

    await studio.set('forge-accounts', 'github:github.com:octocat', 'ghp_x');
    await coder.set('db-credentials', 'c1', 'pw', { fingerprint: 'fp' });
    await coder.set('secrets', 'twelveDataApiKey', 'td');

    for (const client of [studio, coder]) {
      expect(await client.has('forge-accounts', 'github:github.com:octocat')).toBe(true);
      expect(await client.has('db-credentials', 'c1')).toBe(true);
      expect(await client.has('secrets', 'twelveDataApiKey')).toBe(true);
      expect(await client.get('forge-accounts', 'github:github.com:octocat')).toBe('ghp_x');
    }

    await coder.delete('forge-accounts', 'github:github.com:octocat');
    expect(await studio.has('forge-accounts', 'github:github.com:octocat')).toBe(false);
  });

  it('shares a session-only forge token between apps when the keychain is unavailable', async () => {
    cipher.setAvailable(false);
    const service = createVaultService({ directory: dir, cipher });
    await service.forApp('agents').set('forge-accounts', 'a', 'tok');
    expect(await service.forApp('coder').has('forge-accounts', 'a')).toBe(true);
  });

  it('hands every access to the authorize seam with the caller’s app id — and honours a denial', async () => {
    const seen: VaultAccess[] = [];
    const service = createVaultService({
      directory: dir,
      cipher,
      // Theme J's grants will live here; this one only lets Studio write.
      authorize: (access) => {
        seen.push(access);
        return access.appId === 'studio' || access.op === 'read';
      },
    });
    await service.forApp('studio').set('secrets', 'k', 'v');
    expect(await service.forApp('money').get('secrets', 'k')).toBe('v');
    await expect(service.forApp('money').delete('secrets', 'k')).rejects.toBeInstanceOf(VaultAccessDeniedError);

    expect(seen).toEqual([
      { appId: 'studio', namespace: 'secrets', key: 'k', op: 'write' },
      { appId: 'money', namespace: 'secrets', key: 'k', op: 'read' },
      { appId: 'money', namespace: 'secrets', key: 'k', op: 'delete' },
    ]);
  });

  it('answers a denied read as absent rather than throwing', async () => {
    const service = createVaultService({ directory: dir, cipher, authorize: (a) => a.appId === 'studio' });
    await service.forApp('studio').set('secrets', 'k', 'v');
    expect(await service.forApp('gamer').has('secrets', 'k')).toBe(false);
    expect(await service.forApp('gamer').get('secrets', 'k')).toBeNull();
  });
});

describe('runtime vault — keys', () => {
  it('lists entry ids only, honouring the authorize seam and session-only entries', async () => {
    cipher.setAvailable(true);
    const open = createVaultService({ directory: dir, cipher }).forApp('vault');
    await open.set('secrets', 'ollama.apiKey', 'sk-secret-value');
    expect(await open.keys('secrets')).toEqual(['ollama.apiKey']);
    expect(JSON.stringify(await open.keys('secrets'))).not.toContain('sk-secret-value');

    const gated = createVaultService({ directory: dir, cipher, authorize: ({ key }) => key !== 'ollama.apiKey' });
    expect(await gated.forApp('vault').keys('secrets')).toEqual([]);

    cipher.setAvailable(false);
    await open.set('forge-accounts', 'github:github.com:me', 'token');
    expect(await open.keys('forge-accounts')).toEqual(['github:github.com:me']);
  });
});
