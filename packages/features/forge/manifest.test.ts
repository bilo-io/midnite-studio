import {
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_FOLDERS,
  FEATURE_PLACEMENT,
  FEATURE_VIEWS,
  placementOwners,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { forgeManifest } from './manifest';
import { forgeViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and both halves agree. */
describe('forge manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[forgeManifest.feature])[0]).toBe(forgeManifest.owner);
  });

  it('holds the folders FEATURE_PACKAGE_FOLDERS says, each placed with the same owner', () => {
    expect(FEATURE_PACKAGE_FOLDERS.forge[0]).toBe(forgeManifest.feature);
    for (const folder of FEATURE_PACKAGE_FOLDERS.forge) expect(FEATURE_PLACEMENT[folder]).toBe(forgeManifest.owner);
  });

  it('lists exactly the view registrations of its folders, and the renderer loads each', () => {
    expect(forgeManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.actions, ...FEATURE_VIEWS.reviews]);
    expect(Object.keys(forgeViews).sort()).toEqual(forgeManifest.views.map((v) => v.id).sort());
  });

  it('names only real forge channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of [...forgeManifest.ipc, ...forgeManifest.sends]) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:forge(-project)?:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of forgeManifest.events) expect(events.has(event), event).toBe(true);
  });

  it('never names a channel that would hand a token to a renderer', () => {
    for (const channel of forgeManifest.ipc) expect(channel).not.toMatch(/token|secret|api-?key/i);
  });
});
