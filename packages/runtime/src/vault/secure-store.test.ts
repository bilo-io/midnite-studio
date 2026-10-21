import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { createSecureJsonStore, encryptSecret } from './secure-store';
import { createFakeCipher } from './testing';

// The cipher is injected (see secure-store.ts), so no `vi.mock('electron')`.
const cipher = createFakeCipher();

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-secure-store-'));
  cipher.setAvailable(true);
});

describe('createSecureJsonStore', () => {
  it('writes vault files at mode 0o600', async () => {
    const store = createSecureJsonStore<{ encrypted: string }>(dir, 'test.vault.json', () => ({}));
    await store.set('k', { encrypted: encryptSecret(cipher, 'secret') });
    const mode = (await stat(join(dir, 'test.vault.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('never stores plaintext secrets on disk', async () => {
    const store = createSecureJsonStore<{ encrypted: string }>(dir, 'test.vault.json', () => ({}));
    await store.set('k', { encrypted: encryptSecret(cipher, 'hunter2') });
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
