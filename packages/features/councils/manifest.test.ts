import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { councilsManifest } from './manifest';
import { councilsViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('councils manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[councilsManifest.feature])[0]).toBe(councilsManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(councilsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.councils]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(councilsViews).sort()).toEqual(councilsManifest.views.map((v) => v.id).sort());
  });

  it('names only real council channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of councilsManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:council:/);
    }
  });

  it('lists no channel that would hand a key to a renderer', () => {
    for (const channel of councilsManifest.ipc) expect(channel).not.toMatch(/secrets|api-?key/i);
  });
});
