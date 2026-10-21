import { defineFeatureMain, type FeatureMainContext } from '@midnite/studio-runtime';
import { AUDIO_FILE_EXTENSIONS, CHANNELS, EVENT_CHANNELS, failure, ok, schemas, type GitOpResult } from '@midnite/studio-shared';

import { mediaAudioManifest } from '../manifest';
import type { AudioEngineServices } from './engine-services';
import type { AudioService } from './audio-service';
import type { InstallProgress } from './musicgen/runtime';
import type { GmSampleCache } from './music/gm-sample-cache';
import type { MusicExporter } from './music/music-export';
import type { MusicService } from './music/music-service';

export { mediaAudioManifest, type MediaAudioManifest } from '../manifest';
export { audioSlug, audioTimeStamp, createAudioService, type AudioService, type AudioServiceDeps } from './audio-service';
export { createAudioEngineServices, type AudioEngineDeps, type AudioEngineServices } from './engine-services';
export { importAudioProvider } from './import-adapter';
export { expandPrompt, pickOllamaModel, type ExpandDeps } from './ollama-expand';
export { createMusicBroker, musicWorkerScriptPath, unavailableMusicWorker, type MusicBroker, type MusicWorkerHandle } from './musicgen/music-broker';
export { createMusicgenProvider } from './musicgen/provider';
export { createMusicRuntime, type InstallProgress, type MusicRuntimeDeps, type RuntimeStatus } from './musicgen/runtime';
export type { MusicWorkerIn, MusicWorkerOut } from './musicgen/worker-protocol';
export type { MusicEngine, MusicRender, MusicRenderRequest } from './musicgen/engine';
export { createGmSampleCache, parseSampleSet, type GmCacheDeps, type GmEnsureResult, type GmSampleCache } from './music/gm-sample-cache';
export { CC_PAN, CC_VOLUME, ccToPan, ccToVolume, midiToSong, panToCc, songToMidi, volumeToCc } from './music/midi-io';
export { createMusicExporter, type MusicExportDeps, type MusicExporter } from './music/music-export';
export { createMusicService, songNameFromFile, type MusicService, type MusicServiceDeps } from './music/music-service';
export { AudioProviderError, type AudioProvider, type ProducedAudio } from './types';

/**
 * The Audio feature's main half (Phase 113 Theme Q): provider status, engine
 * status/install, generate, cancel, Ollama prompt expansion and Import. The
 * composer builds the services — it owns the worker fork, the Ollama client
 * and the native file picker — so this module never imports `electron`.
 */
export type MediaAudioMainServices = {
  audio: AudioService;
  engine: AudioEngineServices;
  /** Downloads the local model; `onProgress` is already wired to the window event. */
  installEngine: (onProgress: (progress: InstallProgress) => void) => Promise<GitOpResult>;
  /** The native "Import audio" picker: absolute paths, or null when cancelled. Main's, never the renderer's. */
  pickImportFiles: (options: {
    title: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<string[] | null>;
  /**
   * The music editor's services. The composer builds them — they hold its native pickers (the
   * focused window's open and save dialogs) and ffmpeg — so no window crosses this port.
   */
  music: MusicMainServices;
};

export type MusicMainServices = {
  service: MusicService;
  exporter: MusicExporter;
  gm: GmSampleCache;
};

export const mediaAudioMain = defineFeatureMain<MediaAudioMainServices>({
  feature: mediaAudioManifest.feature,
  channels: mediaAudioManifest.ipc,
  register(ctx, { audio, engine, installEngine, pickImportFiles, music }) {
    const invalid = (issue: string) => failure(issue);
    ctx.ipc.handleBare(CHANNELS.mediaAudioProviders, () => ({ providers: audio.providerStatuses() }));
    ctx.ipc.handleBare(CHANNELS.mediaAudioEngine, async () => ({ engine: await engine.status() }));
    ctx.ipc.handleBare(CHANNELS.mediaAudioEngineInstall, () =>
      installEngine((progress) => ctx.emit(EVENT_CHANNELS.mediaAudioEngineProgress, progress)),
    );
    ctx.ipc.handle(CHANNELS.mediaAudioGenerate, schemas.MediaAudioGenerateRequest, (req) => audio.generate(req), invalid);
    ctx.ipc.handle(CHANNELS.mediaAudioCancel, schemas.MediaAudioCancelRequest, ({ importId }) => audio.cancel(importId), invalid);
    ctx.ipc.handle(CHANNELS.mediaAudioExpand, schemas.MediaAudioExpandRequest, (req) => engine.expand(req), invalid);
    ctx.ipc.handle(
      CHANNELS.mediaAudioImport,
      schemas.MediaAudioImportRequest,
      async (req) => {
        try {
          const picked = await pickImportFiles({
            title: 'Import audio',
            filters: [{ name: 'Audio', extensions: [...AUDIO_FILE_EXTENSIONS] }],
          });
          if (!picked || picked.length === 0) return failure('cancelled');
          return await audio.importFiles(req, picked);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      invalid,
    );
    registerMusic(ctx, music);
  },
});

/** The editor's song store, exports and GM samples (Phase 101 Themes B, D, J, K) — one write queue per file, via the media store. */
function registerMusic(ctx: FeatureMainContext, { service, exporter, gm }: MusicMainServices): void {
  const invalid = (issue: string) => failure(issue);
  const { handle, handleBare } = ctx.ipc;
  handle(CHANNELS.mediaMusicList, schemas.MediaMusicListRequest, (r) => service.list(r.repoId, r.project), invalid);
  handle(CHANNELS.mediaMusicRead, schemas.MediaMusicReadRequest, (r) => service.read(r.repoId, r.project, r.name), invalid);
  handle(CHANNELS.mediaMusicWrite, schemas.MediaMusicWriteRequest, (r) => service.write(r.repoId, r.project, r.name, r.song), invalid);
  handle(CHANNELS.mediaMusicImport, schemas.MediaMusicImportRequest, (r) => service.importFiles(r.repoId, r.project), invalid);
  handle(CHANNELS.mediaMusicDelete, schemas.MediaMusicDeleteRequest, (r) => service.remove(r.repoId, r.project, r.name), invalid);
  handle(CHANNELS.mediaMusicExport, schemas.MediaMusicExportRequest, (r) => exporter.exportSong(r), invalid);
  handle(CHANNELS.mediaMusicSendToGenerator, schemas.MediaMusicSendToGeneratorRequest, (r) => exporter.sendToGenerator(r), invalid);
  handleBare(CHANNELS.mediaGmStatus, () => gm.status());
  handle(
    CHANNELS.mediaGmEnsure,
    schemas.MediaGmEnsureRequest,
    async ({ program }) => {
      const result = await gm.ensure(program, (event) => ctx.emit(EVENT_CHANNELS.mediaGmProgress, event));
      return result.ok ? ok() : failure(result.error);
    },
    invalid,
  );
  handle(
    CHANNELS.mediaGmLoad,
    schemas.MediaGmLoadRequest,
    async ({ program }) => {
      const loaded = await gm.load(program);
      return loaded ? ok(loaded) : failure('Instrument not downloaded');
    },
    invalid,
  );
}
