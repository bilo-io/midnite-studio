import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { loopsManifest } from './manifest';

describe('loops manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[loopsManifest.feature])[0]).toBe(loopsManifest.owner);
  });

  it('contributes no view and no settings page — it is a panel and a launcher', () => {
    expect(loopsManifest.views).toEqual([]);
    expect(loopsManifest.settingsPages).toEqual([]);
  });

  it('names only real loop-run channels, each once', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    const all = [...loopsManifest.ipc, ...loopsManifest.sends, ...loopsManifest.events];
    expect(new Set(all).size).toBe(all.length);
    for (const channel of all) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel.startsWith('mstudio:loop-runs:'), channel).toBe(true);
    }
  });
});
