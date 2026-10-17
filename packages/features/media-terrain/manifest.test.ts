import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { mediaTerrainMain, type TerrainService } from './main';
import { mediaTerrainManifest } from './manifest';

/** A bad payload is answered before a service is called, so no method may be reached. */
const service = new Proxy({} as TerrainService, {
  get: () => () => {
    throw new Error('the service must not be reached');
  },
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-terrain manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-terrain']).toEqual({ folder: mediaTerrainManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaTerrainManifest.feature])).toContain(mediaTerrainManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaTerrainManifest.views).toEqual([]);
  });

  it('names only real terrain channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaTerrainManifest.ipc, ...mediaTerrainManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:terrain-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaTerrainMain.register(ctx, { service });
    expect([...ctx.channels].sort()).toEqual([...mediaTerrainManifest.ipc].sort());
  });

  it('answers a bad payload with the envelope, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaTerrainMain.register(ctx, { service });
    expect(await ctx.invoke(CHANNELS.mediaTerrainGet, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaTerrainBuild, { nope: true })).toMatchObject({ ok: false });
  });
});
