import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { monitorManifest } from './manifest';
import { monitorViews } from './renderer';

/** The template's contract (see the optimizer's): manifest, shared registrations and the renderer agree. */
describe('monitor manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[monitorManifest.feature])[0]).toBe(monitorManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(monitorManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.monitor]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(monitorViews).sort()).toEqual(monitorManifest.views.map((v) => v.id).sort());
  });

  it('names only real monitor and system channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of monitorManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:(metrics|system|monitor):/.test(channel), channel).toBe(true);
    }
  });
});
