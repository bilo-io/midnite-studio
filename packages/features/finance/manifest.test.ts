import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { financeManifest } from './manifest';

/** The template's contract (see the optimizer's): manifest and shared registrations agree. */
describe('finance manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[financeManifest.feature])[0]).toBe(financeManifest.owner);
  });

  it('has no view of its own, and shared registers none', () => {
    expect(financeManifest.views).toEqual([]);
    expect(Object.keys(FEATURE_VIEWS)).not.toContain('finance');
  });

  it('names only real finance and markets channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of financeManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:(finance|markets):/.test(channel), channel).toBe(true);
    }
  });

  it('never lists a channel that would hand the market-data key to a renderer', () => {
    for (const channel of financeManifest.ipc) expect(channel).not.toMatch(/secrets/);
  });
});
