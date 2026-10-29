import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { terminalManifest } from './manifest';

describe('terminal manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[terminalManifest.feature])[0]).toBe(terminalManifest.owner);
  });

  it('contributes no view and no settings page — it is a panel', () => {
    expect(terminalManifest.views).toEqual([]);
    expect(terminalManifest.settingsPages).toEqual([]);
  });

  it('names only real pty and terminal channels, each once', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    const all = [...terminalManifest.ipc, ...terminalManifest.sends, ...terminalManifest.events];
    expect(new Set(all).size).toBe(all.length);
    for (const channel of all) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:(pty|terminal):/.test(channel), channel).toBe(true);
    }
  });
});
