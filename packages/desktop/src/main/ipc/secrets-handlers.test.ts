// @vitest-environment node
import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { fromWebContents: () => null } }));

import type { SecretsVault } from '../secrets-vault';
import { configureSecrets, readTwelveDataKey, registerSecretsHandlers } from './secrets-handlers';

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
