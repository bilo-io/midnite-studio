import { createRecordingContext } from '@midnite/studio-runtime';
import {
  ALL_APPS_INSTALLED,
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_PLACEMENT,
  installedSet,
  listMcpToolIds,
  MCP_TOOL_IDS,
  mcpToolOwner,
  placementOwners,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { mediaAudioMain as mediaMain, type AudioEngineServices, type AudioService, type MediaAudioMainServices, type MusicMainServices } from './main';
import { mediaAudioManifest } from './manifest';

const services = (over: Partial<MediaAudioMainServices> = {}): MediaAudioMainServices => ({
  audio: {} as AudioService,
  engine: {} as AudioEngineServices,
  installEngine: vi.fn(),
  pickImportFiles: vi.fn(),
  music: { service: {}, exporter: {}, gm: {} } as MusicMainServices,
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

describe('media-audio MCP ownership', () => {
  const music = MCP_TOOL_IDS.filter((id) => id.startsWith('music_'));

  it('declares exactly the music_* tools, owned by Creator', () => {
    expect([...mediaAudioManifest.mcpTools]).toEqual(music);
    for (const id of music) expect(mcpToolOwner(id, [mediaAudioManifest])).toBe('creator');
  });

  it('Studio lists every tool, a Creator-only install lists the music ones, an Agents-only one none', () => {
    const manifests = [mediaAudioManifest];
    expect(listMcpToolIds(ALL_APPS_INSTALLED, manifests)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet(['creator']), manifests)).toEqual(expect.arrayContaining(music));
    expect(listMcpToolIds(installedSet(['agents']), manifests).some((id) => music.includes(id))).toBe(false);
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

describe('media-audio music editor main half', () => {
  it('serves the song store and exports without a window, and the GM samples over the context', async () => {
    const list = vi.fn(async () => ({ ok: true, value: [] }));
    const exportSong = vi.fn(async () => ({ ok: true, value: { dest: '/x.mid' } }));
    const ensure = vi.fn(async (_program: number, onProgress: (event: never) => void) => {
      onProgress({ program: 0, fraction: 1 } as never);
      return { ok: true as const };
    });
    const ctx = createRecordingContext();
    mediaMain.register(
      ctx,
      services({
        music: {
          service: { list } as unknown as MusicMainServices['service'],
          exporter: { exportSong } as unknown as MusicMainServices['exporter'],
          gm: { ensure } as unknown as MusicMainServices['gm'],
        },
      }),
    );
    expect(await ctx.invoke(CHANNELS.mediaMusicList, { repoId: 'r', project: 'p' })).toEqual({ ok: true, value: [] });
    expect(list).toHaveBeenCalledWith('r', 'p');
    await ctx.invoke(CHANNELS.mediaGmEnsure, { program: 0 });
    expect(ctx.emitted.map((e) => e.channel)).toEqual([EVENT_CHANNELS.mediaGmProgress]);
  });
});
