import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { encryptString, decryptString, isEncryptionAvailable } = vi.hoisted(() => ({
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')),
  isEncryptionAvailable: vi.fn(() => true),
}));
vi.mock('electron', () => ({
  safeStorage: { encryptString, decryptString, isEncryptionAvailable },
}));

let createSecretsVault: typeof import('./secrets-vault').createSecretsVault;
let secretsVaultPath: typeof import('./secrets-vault').secretsVaultPath;
beforeAll(async () => {
  ({ createSecretsVault, secretsVaultPath } = await import('./secrets-vault'));
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-secrets-vault-'));
  isEncryptionAvailable.mockReturnValue(true);
});

describe('createSecretsVault', () => {
  it('encrypts on save and decrypts on read', async () => {
    const vault = createSecretsVault(dir);
    await vault.set('finance.twelveData', 'td-key-123');
    expect(await vault.get('finance.twelveData')).toBe('td-key-123');
  });

  it('stores secrets.vault.json at 0o600 without plaintext', async () => {
    const vault = createSecretsVault(dir);
    await vault.set('finance.twelveData', 'td-key-123');
    const file = secretsVaultPath(dir);
    const mode = (await stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
    const raw = await readFile(file, 'utf8');
    expect(raw).not.toContain('td-key-123');
  });
});
