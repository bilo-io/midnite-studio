import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applySettingsSync, currentSettings, onSettingsChange, resetSettingsMirrorForTests } from './settings-mirror';

beforeEach(() => {
  resetSettingsMirrorForTests();
});

describe('settings-mirror', () => {
  it('defaults to auto-fetch enabled at 60s before the renderer ever pushes', () => {
    expect(currentSettings()).toEqual({
      autoFetchEnabled: true,
      autoFetchIntervalMs: 60_000,
      appDiscardIdle: {
        spotify: false,
        'google-calendar': false,
        youtube: false,
      },
      browserDiscardMs: 10 * 60 * 1000,
    });
  });

  it('applySettingsSync replaces the snapshot', () => {
    applySettingsSync({ autoFetchEnabled: false, autoFetchIntervalMs: 120_000 });

    expect(currentSettings()).toEqual({ autoFetchEnabled: false, autoFetchIntervalMs: 120_000 });
  });

  it('notifies every registered listener on change, and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onSettingsChange(listener);

    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 30_000 });
    expect(listener).toHaveBeenCalledWith({ autoFetchEnabled: true, autoFetchIntervalMs: 30_000 });

    unsubscribe();
    applySettingsSync({ autoFetchEnabled: false, autoFetchIntervalMs: 30_000 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
