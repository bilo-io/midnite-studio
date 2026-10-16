// @vitest-environment node
import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { fromWebContents: () => null } }));

import type { SecretsVault } from '../secrets-vault';
import { accountCredentials, configureSecrets, readTwelveDataKey, registerSecretsHandlers } from './secrets-handlers';

function invoke(channel: string, raw?: unknown): Promise<unknown> {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler for ${channel}`);
  return Promise.resolve(listener({}, raw));
}

describe('secrets handlers — the market-data key stays in main', () => {
  const stored: Record<string, string> = { 'finance.twelveData': 'TD-SECRET', 'media.openaiApiKey': 'sk-other' };
  beforeEach(() => {
    handle.mockClear();
    configureSecrets({
      get: async (key: string) => stored[key] ?? null,
      set: async () => undefined,
      delete: async () => undefined,
      getEntry: async (name: string) => stored[name] ?? null,
      setEntry: async (name: string, value: string) => void (stored[name] = value),
      deleteEntry: async (name: string) => void delete stored[name],
    } as unknown as SecretsVault);
    registerSecretsHandlers();
  });

  it('main reads the key for the finance handlers', async () => {
    expect(await readTwelveDataKey()).toBe('TD-SECRET');
  });

  it('secretsGet refuses the key, so the renderer can never receive it', async () => {
    const out = await invoke(CHANNELS.secretsGet, { key: 'finance.twelveData' });
    expect(out).toEqual({ value: null });
    expect(JSON.stringify(out)).not.toContain('TD-SECRET');
  });

  it('secretsHas still tells the renderer whether one is set — a boolean, never the value', async () => {
    const out = await invoke(CHANNELS.secretsHas, { key: 'finance.twelveData' });
    expect(out).toEqual({ hasKey: true });
  });
});

describe('secrets handlers — brokerage account credentials are main-only', () => {
  const NAME = 'finance.account.kraken.kraken-1.apiSecret';
  const stored: Record<string, string> = {};
  beforeEach(() => {
    handle.mockClear();
    for (const k of Object.keys(stored)) delete stored[k];
    configureSecrets({
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
      getEntry: async (name: string) => stored[name] ?? null,
      setEntry: async (name: string, value: string) => void (stored[name] = value),
      deleteEntry: async (name: string) => void delete stored[name],
    } as unknown as SecretsVault);
    registerSecretsHandlers();
  });

  it('main can store, read and delete a free-named credential', async () => {
    await accountCredentials.set(NAME, 'KRAKEN-PRIVATE');
    expect(await accountCredentials.get(NAME)).toBe('KRAKEN-PRIVATE');
    await accountCredentials.delete(NAME);
    expect(await accountCredentials.get(NAME)).toBeNull();
  });

  it.each([CHANNELS.secretsGet, CHANNELS.secretsHas])('%s cannot be asked for it — the key enum rejects the name', async (channel) => {
    stored[NAME] = 'KRAKEN-PRIVATE';
    const out = await invoke(channel, { key: NAME });
    expect(JSON.stringify(out)).not.toContain('KRAKEN-PRIVATE');
    expect(out).not.toEqual({ hasKey: true });
  });

  it('secretsSet cannot write one either', async () => {
    await invoke(CHANNELS.secretsSet, { key: NAME, value: 'planted' });
    expect(stored[NAME]).toBeUndefined();
  });
});
