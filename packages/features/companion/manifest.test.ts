// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { companionManifest } from './manifest';

describe('companion manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[companionManifest.feature])[0]).toBe(companionManifest.owner);
  });

  it('contributes no view and no settings page — it is a panel', () => {
    expect(companionManifest.views).toEqual([]);
    expect(companionManifest.settingsPages).toEqual([]);
  });

  it('covers every companion channel the contract defines, each once', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    const all = [...companionManifest.ipc, ...companionManifest.sends];
    expect(new Set(all).size).toBe(all.length);
    for (const channel of all) expect(known.has(channel), channel).toBe(true);
    const contract = Object.values(CHANNELS).filter((c) => c.startsWith('mstudio:companion:'));
    expect([...all].sort()).toEqual([...contract].sort());
    expect(companionManifest.events).toEqual([EVENT_CHANNELS.companionUiRequest]);
  });
});
