import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { apiClientManifest } from './manifest';
import { apiClientViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('api-client manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[apiClientManifest.feature])[0]).toBe(apiClientManifest.owner);
  });

  it('lists exactly its shared view registration, and the renderer loads it', () => {
    expect(apiClientManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS['api-client']]);
    expect(Object.keys(apiClientViews)).toEqual(['apiClient']);
  });

  it('names only real api-client channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of apiClientManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:api-client:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of apiClientManifest.events) {
      expect(events.has(event), event).toBe(true);
      expect(event).toMatch(/^mstudio:api-client:/);
    }
  });

  it('claims every api-client channel the contract declares, none left to a handler nobody registers', () => {
    const declared = Object.values(CHANNELS).filter((channel) => channel.startsWith('mstudio:api-client:'));
    expect([...apiClientManifest.ipc].sort()).toEqual([...declared].sort());
  });
});
