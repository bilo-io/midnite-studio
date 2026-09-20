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

let createSecureJsonStore: typeof import('./secure-store').createSecureJsonStore;
let encryptSecret: typeof import('./secure-store').encryptSecret;
beforeAll(async () => {
  ({ createSecureJsonStore, encryptSecret } = await import('./secure-store'));
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-secure-store-'));
  isEncryptionAvailable.mockReturnValue(true);
});

describe('createSecureJsonStore', () => {
  it('writes vault files at mode 0o600', async () => {
    const store = createSecureJsonStore<{ encrypted: string }>(dir, 'test.vault.json', () => ({}));
    await store.set('k', { encrypted: encryptSecret('secret') });
    const mode = (await stat(join(dir, 'test.vault.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('never stores plaintext secrets on disk', async () => {
    const store = createSecureJsonStore<{ encrypted: string }>(dir, 'test.vault.json', () => ({}));
    await store.set('k', { encrypted: encryptSecret('hunter2') });
    const raw = await readFile(join(dir, 'test.vault.json'), 'utf8');
    expect(raw).not.toContain('hunter2');
  });

  it('survives a corrupt file by starting empty', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'test.vault.json'), '{ not json');
    const store = createSecureJsonStore<{ encrypted: string }>(
      dir,
      'test.vault.json',
      () => ({}),
    );
    expect(await store.get('k')).toBeNull();
  });
});
