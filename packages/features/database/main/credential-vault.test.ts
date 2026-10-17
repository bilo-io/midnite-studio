// @vitest-environment node
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ConnectionConfig } from '@midnite/studio-shared';
import { createVaultService } from '@midnite/studio-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectionFingerprint, createCredentialVault } from './credential-vault';

// `safeStorage` is not touched here: the cipher below is injected into the runtime vault.
const { encryptString, decryptString, isEncryptionAvailable } = vi.hoisted(() => ({
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')),
  isEncryptionAvailable: vi.fn(() => true),
}));
// Phase 113 Theme D: the vault is the runtime's, with `safeStorage` injected
// as its cipher — these mocks are that cipher, so no `vi.mock('electron')`.
const vaultIn = (directory: string) =>
  createVaultService({ directory, cipher: { encryptString, decryptString, isEncryptionAvailable } }).forApp('studio');

const postgres: ConnectionConfig = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-db-vault-'));
  isEncryptionAvailable.mockReturnValue(true);
});

describe('createCredentialVault', () => {
  it('starts with nothing saved', async () => {
    const vault = createCredentialVault(vaultIn(dir));
    expect(await vault.get('c1')).toBeNull();
  });

  it('encrypts on save and decrypts on read, across instances', async () => {
    const first = createCredentialVault(vaultIn(dir));
    await first.set(postgres, 'hunter2');

    const second = createCredentialVault(vaultIn(dir));
    expect(await second.get('c1')).toBe('hunter2');
    expect(encryptString).toHaveBeenCalledWith('hunter2');
  });

  it('never writes a plaintext password to disk', async () => {
    const vault = createCredentialVault(vaultIn(dir));
    await vault.set(postgres, 'hunter2');
    const raw = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(dir, 'db-connections.vault.json'), 'utf8'),
    );
    expect(raw).not.toContain('hunter2');
  });

  it('degrades to refusing a save when encryption is unavailable, without throwing', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const vault = createCredentialVault(vaultIn(dir));
    await expect(vault.set(postgres, 'hunter2')).resolves.toBeUndefined();
    expect(await vault.get('c1')).toBeNull();
  });

  it('deletes a stored password', async () => {
    const vault = createCredentialVault(vaultIn(dir));
    await vault.set(postgres, 'hunter2');
    await vault.delete('c1');
    expect(await vault.get('c1')).toBeNull();
  });

  it('survives a corrupt file by starting empty', async () => {
    await writeFile(join(dir, 'db-connections.vault.json'), '{ not json');
    const vault = createCredentialVault(vaultIn(dir));
    expect(await vault.get('c1')).toBeNull();
  });

  describe('reconcile', () => {
    it('keeps a password whose connection is unchanged', async () => {
      const vault = createCredentialVault(vaultIn(dir));
      await vault.set(postgres, 'hunter2');
      await vault.reconcile(postgres);
      expect(await vault.get('c1')).toBe('hunter2');
    });

    it('revokes a password once the connection host/database has changed', async () => {
      // The trust-store pattern: editing the thing the password authenticated
      // against must not silently keep reusing a stored secret typed in for
      // the OLD target.
      const vault = createCredentialVault(vaultIn(dir));
      await vault.set(postgres, 'hunter2');
      await vault.reconcile({ ...postgres, host: 'otherhost' });
      expect(await vault.get('c1')).toBeNull();
    });
  });
});

describe('connectionFingerprint', () => {
  it('differs when host, database, provider or path change', () => {
    const base = connectionFingerprint(postgres);
    expect(connectionFingerprint({ ...postgres, host: 'otherhost' })).not.toBe(base);
    expect(connectionFingerprint({ ...postgres, database: 'other' })).not.toBe(base);
    expect(connectionFingerprint({ ...postgres, provider: 'mysql' })).not.toBe(base);
  });

  it('matches for an identical connection', () => {
    expect(connectionFingerprint(postgres)).toBe(connectionFingerprint({ ...postgres }));
  });
});
