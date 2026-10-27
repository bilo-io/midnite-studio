import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_SETTINGS_PAGES, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { vanguardManifest } from './manifest';
import { vanguardViews } from './renderer';

/** The template's contract (see monitor's): manifest, shared registrations and the renderer agree. */
describe('vanguard manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[vanguardManifest.feature])[0]).toBe(vanguardManifest.owner);
  });

  it('lists exactly its shared view and settings page registrations', () => {
    expect(vanguardManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.vanguard]);
    expect(vanguardManifest.settingsPages).toEqual([...FEATURE_SETTINGS_PAGES.vanguard]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(vanguardViews).sort()).toEqual(vanguardManifest.views.map((v) => v.id).sort());
  });

  it('names only real security and vanguard channels, and its events exist', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of vanguardManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:(security|vanguard):/.test(channel), channel).toBe(true);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of vanguardManifest.events) expect(events.has(event), event).toBe(true);
  });

  it('is global and takes no chord', () => {
    expect(vanguardManifest.views[0].global).toBe(true);
  });
});
