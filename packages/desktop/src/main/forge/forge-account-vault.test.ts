import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { forgeAccountVaultKey } from '@midnite/studio-shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { encryptString, decryptString, isEncryptionAvailable } = vi.hoisted(() => ({
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')),
  isEncryptionAvailable: vi.fn(() => true),
}));
vi.mock('electron', () => ({
  safeStorage: { encryptString, decryptString, isEncryptionAvailable },
}));

// Dynamic import, after the `electron` mock is in place — same reason
// `credential-vault.test.ts` does this.
let createForgeAccountVault: typeof import('./forge-account-vault').createForgeAccountVault;
let forgeAccountVaultPath: typeof import('./forge-account-vault').forgeAccountVaultPath;
beforeAll(async () => {
  ({ createForgeAccountVault, forgeAccountVaultPath } = await import('./forge-account-vault'));
});

const key = forgeAccountVaultKey('gitlab', 'gitlab.com', 'octocat');

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-forge-vault-'));
  isEncryptionAvailable.mockReturnValue(true);
  encryptString.mockClear();
  decryptString.mockClear();
});

describe('createForgeAccountVault', () => {
  it('starts with nothing saved', async () => {
    const vault = createForgeAccountVault(dir);
    expect(await vault.get(key)).toBeNull();
  });

  it('encrypts on save and decrypts on read, across instances', async () => {
    const first = createForgeAccountVault(dir);
    await first.set(key, 'glpat-abc123');

    const second = createForgeAccountVault(dir);
    expect(await second.get(key)).toBe('glpat-abc123');
    expect(encryptString).toHaveBeenCalledWith('glpat-abc123');
  });

  it('deletes an entry', async () => {
    const vault = createForgeAccountVault(dir);
    await vault.set(key, 'glpat-abc123');
    await vault.delete(key);
    expect(await vault.get(key)).toBeNull();
  });

  it('writes the vault file at 0600', async () => {
    const vault = createForgeAccountVault(dir);
    await vault.set(key, 'glpat-abc123');
    const mode = (await stat(forgeAccountVaultPath(dir))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('never writes a plaintext token to disk', async () => {
    const vault = createForgeAccountVault(dir);
    await vault.set(key, 'glpat-abc123');
    const raw = await import('node:fs/promises').then((fs) =>
      fs.readFile(forgeAccountVaultPath(dir), 'utf8'),
    );
    expect(raw).not.toContain('glpat-abc123');
  });

  // The load-bearing difference from `credential-vault.ts`/`secrets-vault.ts`
  // — see the module's own docblock. Both siblings drop a `set()` silently
  // when encryption is unavailable; this vault holds it in memory instead.
  describe('when safeStorage is unavailable', () => {
    beforeEach(() => {
      isEncryptionAvailable.mockReturnValue(false);
    });

    it('reports unavailable', () => {
      const vault = createForgeAccountVault(dir);
      expect(vault.isAvailable()).toBe(false);
    });

    it('holds a set token in memory for the session rather than dropping it', async () => {
      const vault = createForgeAccountVault(dir);
      await vault.set(key, 'glpat-abc123');
      expect(await vault.get(key)).toBe('glpat-abc123');
      expect(encryptString).not.toHaveBeenCalled();
    });

    it('does not persist the session-only token across instances', async () => {
      const first = createForgeAccountVault(dir);
      await first.set(key, 'glpat-abc123');

      const second = createForgeAccountVault(dir);
      expect(await second.get(key)).toBeNull();
    });
  });
});
