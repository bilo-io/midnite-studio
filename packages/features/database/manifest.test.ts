import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { databaseManifest } from './manifest';
import { databaseViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('database manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[databaseManifest.feature])[0]).toBe(databaseManifest.owner);
  });

  it('lists exactly its shared view registration, and the renderer loads it', () => {
    expect(databaseManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.database]);
    expect(Object.keys(databaseViews)).toEqual(['database']);
  });

  it('names only real db channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of databaseManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:db:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of databaseManifest.events) {
      expect(events.has(event), event).toBe(true);
      expect(event).toMatch(/^mstudio:db:/);
    }
  });

  it('is a global view: a connection is not a property of an open repository', () => {
    expect(databaseManifest.views[0]?.global).toBe(true);
  });
});
