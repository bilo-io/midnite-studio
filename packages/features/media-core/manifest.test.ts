import { describe, expect, it } from 'vitest';

import {
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_PLACEMENT,
  placementOwners,
} from '@midnite/studio-shared';

import { mediaCoreManifest } from './manifest';

/** The template's contract (see the notes manifest's): manifest, placement and channels agree. */
describe('media-core manifest', () => {
  it('belongs to the folder it was split from, owned by that folder’s owner', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-core'].folder).toBe(mediaCoreManifest.feature);
    expect(placementOwners(FEATURE_PLACEMENT[mediaCoreManifest.feature])[0]).toBe(mediaCoreManifest.owner);
  });

  it('is composed by every app the media folder reaches', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-core'].placement).toEqual(FEATURE_PLACEMENT.media);
  });

  it('contributes no view of its own — each app composes MediaShell with its tabs', () => {
    expect(mediaCoreManifest.views).toEqual([]);
  });

  it('names only real media channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of mediaCoreManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:/.test(channel), channel).toBe(true);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const channel of mediaCoreManifest.events) expect(events.has(channel), channel).toBe(true);
  });
});
