import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { mediaAudioMain as mediaMain, type AudioEngineServices, type AudioService, type MediaAudioMainServices } from './main';
import { mediaAudioManifest } from './manifest';

const services = (over: Partial<MediaAudioMainServices> = {}): MediaAudioMainServices => ({
  audio: {} as AudioService,
  engine: {} as AudioEngineServices,
  installEngine: vi.fn(),
  pickImportFiles: vi.fn(),
  ...over,
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-audio manifest', () => {
  it('belongs to the media folder, composed by Creator (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-audio']).toEqual({ folder: mediaAudioManifest.feature, placement: 'creator' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaAudioManifest.feature])[0]).toBe(mediaAudioManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaAudioManifest.views).toEqual([]);
  });

  it('names only real media channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaAudioManifest.ipc, ...mediaAudioManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaAudioManifest.ipc].sort());
  });
});

describe('media-audio main half', () => {
  it('Import answers "cancelled" when the native picker is dismissed, and never imports', async () => {
    const importFiles = vi.fn();
    const ctx = createRecordingContext();
    mediaMain.register(ctx, services({ audio: { importFiles } as unknown as AudioService, pickImportFiles: async () => null }));
    const result = await ctx.invoke(CHANNELS.mediaAudioImport, {
      repoId: 'r',
      importId: 'i',
      project: 'p',
      prompt: { title: 't', style: [], lyrics: '', instrumental: true, durationS: 30, count: 1 },
    });
    expect(result).toMatchObject({ ok: false, message: 'cancelled' });
    expect(importFiles).not.toHaveBeenCalled();
  });

  it('streams engine install progress to the window as an event', async () => {
    const ctx = createRecordingContext();
    mediaMain.register(
      ctx,
      services({
        installEngine: async (onProgress) => {
          onProgress({ phase: 'download', fraction: 0.5 });
          return { ok: true, value: undefined };
        },
      }),
    );
    await ctx.invoke(CHANNELS.mediaAudioEngineInstall);
    expect(ctx.emitted).toEqual([{ channel: EVENT_CHANNELS.mediaAudioEngineProgress, payload: { phase: 'download', fraction: 0.5 } }]);
  });
});
