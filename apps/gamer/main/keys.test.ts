// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { VaultAccessDeniedError } from '@midnite/studio-runtime';

import { createGamerKeyReader, GAMER_SECRET_KEYS } from './keys';

/** Which keys Gamer reads, and that a denied, absent or unreachable vault is "not set" — never a throw. */
describe('createGamerKeyReader', () => {
  it('reads only Gamer\'s three keys, from the secrets namespace', async () => {
    const get = vi.fn(async (_namespace: string, key: string) => `value-of-${key}`);
    const read = createGamerKeyReader({ get: get as never });
    expect([...GAMER_SECRET_KEYS]).toEqual(['media.mapTilerApiKey', 'media.geminiApiKey', 'media.openaiApiKey']);
    expect(await read('media.mapTilerApiKey')).toBe('value-of-media.mapTilerApiKey');
    expect(get).toHaveBeenCalledWith('secrets', 'media.mapTilerApiKey');
  });

  it('never asks the vault for a key outside the list, even one it could be granted', async () => {
    const get = vi.fn(async () => 'secret');
    const read = createGamerKeyReader({ get: get as never });
    expect(await read('agent.claude.apiKey')).toBeNull();
    expect(await read('finance.twelveData')).toBeNull();
    expect(await read('media.huggingFaceToken')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('answers null when the key is absent, denied or the host is unreachable', async () => {
    expect(await createGamerKeyReader({ get: async () => null })('media.geminiApiKey')).toBeNull();
    expect(await createGamerKeyReader({ get: async () => '' })('media.geminiApiKey')).toBeNull();
    const denied = createGamerKeyReader({
      get: async () => {
        throw new VaultAccessDeniedError({ appId: 'gamer', namespace: 'secrets', key: 'media.geminiApiKey', op: 'read' });
      },
    });
    expect(await denied('media.geminiApiKey')).toBeNull();
    const down = createGamerKeyReader({
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await down('media.openaiApiKey')).toBeNull();
  });
});
