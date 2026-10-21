import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { mediaImagesMain as mediaMain, type ImageService } from './main';
import { mediaImagesManifest } from './manifest';

const services = () => ({ images: {} as ImageService });

/** The template's contract: manifest, placement and the main half agree. */
describe('media-images manifest', () => {
  it('belongs to the media folder, composed by Creator (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-images']).toEqual({ folder: mediaImagesManifest.feature, placement: 'creator' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaImagesManifest.feature])[0]).toBe(mediaImagesManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaImagesManifest.views).toEqual([]);
  });

  it('names only real media channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaImagesManifest.ipc, ...mediaImagesManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaImagesManifest.ipc].sort());
  });
});
