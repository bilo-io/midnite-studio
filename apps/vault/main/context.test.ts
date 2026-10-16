// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain and a fake cipher.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { vaultManifest } from '@midnite/studio-feature-vault/main';
import { createFakeCipher } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerVaultHandlers } from './context';

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'midnite-vault-app-'));
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const on = new Set<string>();
  registerVaultHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c) => void on.add(c) },
    trashItem: async () => undefined,
    send: () => undefined,
    cipher: createFakeCipher(),
    directory,
  });
  return { handlers, on, directory };
}

describe('registerVaultHandlers', () => {
  it('registers exactly the manifest channels — and never secretsGet', async () => {
    const { handlers, on } = await setup();
    expect([...handlers.keys()].sort()).toEqual([...vaultManifest.ipc].sort());
    expect(handlers.has(CHANNELS.secretsGet)).toBe(false);
    expect(on.size).toBe(0);
  });

  it('stores a value encrypted, answers only that it is set, and clears it', async () => {
    const { handlers, directory } = await setup();
    const key = 'media.openaiApiKey';
    await handlers.get(CHANNELS.secretsSet)?.({}, { key, value: 'sk-plaintext-canary' });
    const has = await handlers.get(CHANNELS.secretsHas)?.({}, { key });
    expect(has).toEqual({ hasKey: true });
    expect(JSON.stringify(has)).not.toContain('sk-plaintext-canary');
    const file = await readFile(join(directory, 'secrets.vault.json'), 'utf8');
    expect(file).not.toContain('sk-plaintext-canary');
    await handlers.get(CHANNELS.secretsSet)?.({}, { key, value: '' });
    expect(await handlers.get(CHANNELS.secretsHas)?.({}, { key })).toEqual({ hasKey: false });
  });
});
