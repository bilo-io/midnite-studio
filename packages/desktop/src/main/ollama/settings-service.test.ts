import { beforeEach, describe, expect, it } from 'vitest';

import {
  configureOllamaSettings,
  getConfiguredOllamaHost,
  getOllamaSettings,
  resetOllamaSettingsState,
  setOllamaSettings,
} from './settings-service';
import type { OllamaSettingsStore } from './settings-store';

function fakeStore(initial: { host: string | null; defaultModel: string | null }): OllamaSettingsStore & {
  saved: { host: string | null; defaultModel: string | null }[];
} {
  let state = initial;
  const saved: { host: string | null; defaultModel: string | null }[] = [];
  return {
    load: async () => state,
    save: async (next) => {
      state = next;
      saved.push(next);
    },
    saved,
  };
}

beforeEach(() => {
  resetOllamaSettingsState();
});

describe('getOllamaSettings / getConfiguredOllamaHost', () => {
  it('loads from the store once and caches', async () => {
    const store = fakeStore({ host: '10.0.0.5:11434', defaultModel: null });
    configureOllamaSettings(store);
    expect(await getOllamaSettings()).toEqual({ host: '10.0.0.5:11434', defaultModel: null });
    expect(await getConfiguredOllamaHost()).toBe('10.0.0.5:11434');
  });

  it('returns null host when nothing is configured — callers fall back to resolveOllamaBaseUrl()', async () => {
    configureOllamaSettings(fakeStore({ host: null, defaultModel: null }));
    expect(await getConfiguredOllamaHost()).toBeNull();
  });
});

describe('setOllamaSettings', () => {
  it('changes only the fields present in the patch', async () => {
    const store = fakeStore({ host: 'old-host', defaultModel: 'old-model' });
    configureOllamaSettings(store);
    await getOllamaSettings(); // prime the cache

    const next = await setOllamaSettings({ host: 'new-host' });
    expect(next).toEqual({ host: 'new-host', defaultModel: 'old-model' });
    expect(store.saved).toEqual([{ host: 'new-host', defaultModel: 'old-model' }]);
  });

  it('the cache reflects a write without re-loading from the store', async () => {
    const store = fakeStore({ host: null, defaultModel: null });
    configureOllamaSettings(store);
    await setOllamaSettings({ defaultModel: 'qwen3.5:14b' });
    expect(await getOllamaSettings()).toEqual({ host: null, defaultModel: 'qwen3.5:14b' });
  });
});
