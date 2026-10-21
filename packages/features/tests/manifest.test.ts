import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { testsManifest } from './manifest';
import { testsViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('tests manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[testsManifest.feature])[0]).toBe(testsManifest.owner);
  });

  it('lists exactly its shared view registration, and the renderer loads it', () => {
    expect(testsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.tests]);
    expect(Object.keys(testsViews)).toEqual(['tests']);
  });

  it('names only real tests channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of [...testsManifest.ipc, ...testsManifest.sends]) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:tests:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of testsManifest.events) expect(events.has(event), event).toBe(true);
  });
});
