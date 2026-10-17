import {
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_FOLDERS,
  FEATURE_PLACEMENT,
  FEATURE_VIEWS,
  featurePackagePlacement,
  placementOwners,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { browserManifest } from './manifest';

/** The template's contract (see the monitor's): manifest, shared registrations and the placement map agree. */
describe('browser manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[browserManifest.feature])[0]).toBe(browserManifest.owner);
    expect(featurePackagePlacement('browser')).toBe(FEATURE_PLACEMENT.browser);
  });

  it('holds the folders FEATURE_PACKAGE_FOLDERS says, named after the first', () => {
    expect(FEATURE_PACKAGE_FOLDERS.browser).toEqual(['browser', 'web-apps']);
    expect(FEATURE_PACKAGE_FOLDERS.browser[0]).toBe(browserManifest.feature);
    // `web-apps` keeps its own row: the Browser app owns it, while the package reaches every app.
    expect(FEATURE_PLACEMENT['web-apps']).toBe('browser');
  });

  it('contributes no views — the pane and the rail are drawn by the composing app', () => {
    expect(browserManifest.views).toEqual([]);
    expect('browser' in FEATURE_VIEWS || 'web-apps' in FEATURE_VIEWS).toBe(false);
  });

  it('names only real browser and web-apps channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of [...browserManifest.ipc, ...browserManifest.sends]) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:(browser|web-apps):/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of browserManifest.events) expect(events.has(event), event).toBe(true);
  });

  it('claims every browser and web-apps channel the contract declares', () => {
    const owned = new Set<string>([...browserManifest.ipc, ...browserManifest.sends]);
    const declared = Object.values(CHANNELS).filter((c) => /^mstudio:(browser|web-apps):/.test(c));
    expect(declared.filter((c) => !owned.has(c))).toEqual([]);
  });
});
