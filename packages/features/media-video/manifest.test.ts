import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { mediaVideoMain as mediaMain, type MediaVideoMainServices } from './main';
import { mediaVideoManifest } from './manifest';

const services = (over: Partial<MediaVideoMainServices> = {}): MediaVideoMainServices => ({
  resolveWorkdir: async () => null,
  templateRoot: () => '/no/templates',
  ...over,
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-video manifest', () => {
  it('belongs to the media folder, composed by Creator (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-video']).toEqual({ folder: mediaVideoManifest.feature, placement: 'creator' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaVideoManifest.feature])[0]).toBe(mediaVideoManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaVideoManifest.views).toEqual([]);
  });

  it('names only real video channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaVideoManifest.ipc, ...mediaVideoManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:video:/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaVideoManifest.ipc].sort());
  });
});

describe('media-video main half', () => {
  it('Setup Video fails plainly for a repository that is not open, and never reads the template', async () => {
    const templateRoot = () => {
      throw new Error('the template must not be read');
    };
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services({ templateRoot }));
    const result = await ctx.invoke(CHANNELS.videoSetup, { repoId: 'nope', engine: 'remotion' });
    expect(result).toMatchObject({ ok: false, message: 'That repository is not open.' });
  });

  it('answers a bad payload with the channel’s own empty value, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services());
    expect(await ctx.invoke(CHANNELS.videoProjectGet, {})).toEqual({ project: null });
    expect(await ctx.invoke(CHANNELS.videoRenderList, {})).toEqual({ renders: [] });
  });
});
