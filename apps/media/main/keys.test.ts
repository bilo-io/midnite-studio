// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { VaultAccessDeniedError } from '@midnite/studio-runtime';

import { createMediaKeyReader, MEDIA_SECRET_KEYS } from './keys';

/** Which key Media reads, and that a denied, absent or unreachable vault is "not set" — never a throw. */
describe('createMediaKeyReader', () => {
  it('reads only the TMDB key, from the secrets namespace', async () => {
    const get = vi.fn(async (_namespace: string, key: string) => `value-of-${key}`);
    const read = createMediaKeyReader({ get: get as never });
    expect([...MEDIA_SECRET_KEYS]).toEqual(['media.tmdbApiKey']);
    expect(await read('media.tmdbApiKey')).toBe('value-of-media.tmdbApiKey');
    expect(get).toHaveBeenCalledWith('secrets', 'media.tmdbApiKey');
  });

  it('never asks the vault for a key outside the list, even one it could be granted', async () => {
    const get = vi.fn(async () => 'secret');
    const read = createMediaKeyReader({ get: get as never });
    expect(await read('agent.claude.apiKey')).toBeNull();
    expect(await read('media.geminiApiKey')).toBeNull();
    expect(await read('media.mapTilerApiKey')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('answers null when the key is absent, denied or the host is unreachable', async () => {
    expect(await createMediaKeyReader({ get: async () => null })('media.tmdbApiKey')).toBeNull();
    expect(await createMediaKeyReader({ get: async () => '' })('media.tmdbApiKey')).toBeNull();
    const denied = createMediaKeyReader({
      get: async () => {
        throw new VaultAccessDeniedError({
          appId: 'media',
          namespace: 'secrets',
          key: 'media.tmdbApiKey',
          op: 'read',
        });
      },
    });
    expect(await denied('media.tmdbApiKey')).toBeNull();
    const down = createMediaKeyReader({
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await down('media.tmdbApiKey')).toBeNull();
  });
});
