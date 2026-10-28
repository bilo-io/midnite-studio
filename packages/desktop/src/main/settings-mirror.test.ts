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
      webAppDiscardIdle: {
        spotify: false,
        'google-calendar': false,
        youtube: false,
      },
      browserDiscardMs: 10 * 60 * 1000,
      forgeSyncGhAuthSwitch: true,
      agentBackends: {},
      confineNewSessions: false,
      readAgentHistory: true,
      historyRetentionDays: null,
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

describe('agentHistoryReadsEnabled (Phase 115 Theme F leftover)', () => {
  it('fails closed until the renderer has pushed its settings', async () => {
    const { agentHistoryReadsEnabled } = await import('./settings-mirror');
    expect(agentHistoryReadsEnabled()).toBe(false);
    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: true });
    expect(agentHistoryReadsEnabled()).toBe(true);
    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: false });
    expect(agentHistoryReadsEnabled()).toBe(false);
  });
});
