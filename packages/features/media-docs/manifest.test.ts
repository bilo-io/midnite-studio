import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { mediaDocsMain as mediaMain } from './main';
import { mediaDocsManifest } from './manifest';

const services = () => ({ pickSavePath: async () => null, printToPdf: async () => Buffer.from('') });

/** The template's contract: manifest, placement and the main half agree. */
describe('media-docs manifest', () => {
  it('belongs to the media folder, composed by Creator (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-docs']).toEqual({ folder: mediaDocsManifest.feature, placement: 'creator' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaDocsManifest.feature])[0]).toBe(mediaDocsManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaDocsManifest.views).toEqual([]);
  });

  it('names only real media channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaDocsManifest.ipc, ...mediaDocsManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaDocsManifest.ipc].sort());
  });
});
