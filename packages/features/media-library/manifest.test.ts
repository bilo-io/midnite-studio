import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import {
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_PLACEMENT,
  placementOwners,
} from '@midnite/studio-shared';

import { mediaLibraryMain, type LibraryService } from './main';
import { mediaLibraryManifest } from './manifest';

const services = () => ({ library: {} as LibraryService });

/** The template's contract: manifest, placement and the main half agree. */
describe('media-library manifest', () => {
  it('belongs to the media folder, composed by Midnite Media (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-library']).toEqual({
      folder: mediaLibraryManifest.feature,
      placement: 'media',
    });
    expect(placementOwners(FEATURE_PLACEMENT[mediaLibraryManifest.feature])).toContain(
      mediaLibraryManifest.owner,
    );
  });

  it('is a tab, not a view', () => {
    expect(mediaLibraryManifest.views).toEqual([]);
  });

  it('names only real media library channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaLibraryManifest.ipc, ...mediaLibraryManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:library-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaLibraryMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaLibraryManifest.ipc].sort());
  });
});
