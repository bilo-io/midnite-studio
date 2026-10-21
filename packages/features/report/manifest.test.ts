import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { reportManifest } from './manifest';

/** The template's contract (see the optimizer's): the manifest and the shared registrations agree. */
describe('report manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[reportManifest.feature])[0]).toBe(reportManifest.owner);
  });

  it('contributes no view and no settings page — it is a dialog', () => {
    expect(reportManifest.views).toEqual([]);
    expect(reportManifest.settingsPages).toEqual([]);
  });

  it('names only real report channels, each once', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    const all = [...reportManifest.ipc, ...reportManifest.sends];
    expect(new Set(all).size).toBe(all.length);
    for (const channel of all) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel.startsWith('mstudio:report:'), channel).toBe(true);
    }
  });

  it('covers every report channel the contract defines', () => {
    const contract = Object.values(CHANNELS).filter((c) => c.startsWith('mstudio:report:'));
    expect([...reportManifest.ipc, ...reportManifest.sends].sort()).toEqual([...contract].sort());
    expect(reportManifest.events).toEqual([EVENT_CHANNELS.reportOpen]);
  });
});
