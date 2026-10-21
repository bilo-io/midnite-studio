import { reportMain, type ReportMainServices } from '@midnite/studio-feature-report/main';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMediaService, mediaCoreMain, runFfmpegExport, type MediaService } from '@midnite/studio-feature-media-core/main';
import {
  createAudioEngineServices,
  createAudioService,
  createGmSampleCache,
  createMusicBroker,
  createMusicExporter,
  createMusicService,
  createMusicgenProvider,
  importAudioProvider,
  mediaAudioMain,
  unavailableMusicWorker,
} from '@midnite/studio-feature-media-audio/main';
import { configureVideo, createProjectsStore, mediaVideoMain, resolveHandoffPath } from '@midnite/studio-feature-media-video/main';
import { mediaDocsMain } from '@midnite/studio-feature-media-docs/main';
import {
  agyImageProvider,
  createImageService,
  geminiImageProvider,
  ImageProviderError,
  isAgyInstalled,
  mediaImagesMain,
  openaiImageProvider,
  type ImageProvider,
} from '@midnite/studio-feature-media-images/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, MUSIC_MIDI_FILE_EXTENSIONS, failure, ok, type FfmpegStatus, type SecretKey } from '@midnite/studio-shared';

/**
 * The one "repository" Creator's media is scoped to. The renderer's media store addresses
 * everything by `repoId`; Creator has no repository list, so it has one id that main resolves to
 * its own media root (`<userData>/media`, holding `.midnite/media/<tab>/`).
 */
export const CREATOR_REPO_ID = 'creator';

/** The electron pieces Creator's main needs, injected so registration is testable under bare vitest. */
export type CreatorElectron = IpcContextElectron & {
  /** Report an Issue's services — the crash log sink, home dir, and the three OS calls the dialog needs. */
  report: ReportMainServices;
  /** The folder that holds `.midnite/media/` — `<userData>/media` in the app, a temp dir under test. */
  mediaRoot: string;
  revealPath: (absPath: string) => void;
  pickSavePath: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  printToPdf: (htmlFile: string) => Promise<Buffer>;
  ffmpegStatus: () => Promise<FfmpegStatus>;
  /** Audio's native "Import audio" picker — absolute paths, or null when dismissed. Main's, never the renderer's. */
  pickImportFiles: (options: { title: string; filters: { name: string; extensions: string[] }[] }) => Promise<string[] | null>;
  /** Where the Video service keeps its one setting (`video-settings.json`): Creator's userData. */
  videoSettingsDir: string;
  /** The packaged `templates/media-video` tree Setup Video copies from. */
  videoTemplateRoot: string;
  /** The OS default app for a file (`shell.openPath`): '' on success, else an error message. */
  openPath: (absPath: string) => Promise<string>;
  /** A provider key, read in main from the runtime vault. Never sent to the renderer. */
  readKey: (key: SecretKey) => Promise<string | null>;
  /** `fetch` for the provider APIs; a test passes one that refuses the network. */
  fetch?: typeof fetch;
  /** Ollama has no local client in Creator yet; tests and the app both leave it out. */
  ollama?: ImageProvider;
};

const noOllama: ImageProvider = {
  id: 'ollama',
  generate: async () => {
    throw new ImageProviderError('Ollama image models are not available in Midnite Creator yet.');
  },
};

/**
 * Registers every channel Creator's renderer can call: media-core's store, watcher and export,
 * Docs' export (no Ask AI — Creator has no agents), Images' generation, Audio's import, and Video's projects, studio and renders (and a generator that reports its local engine as unavailable). Returns the media
 * service so the caller can stop its watchers on quit.
 */
export function registerCreatorHandlers(el: CreatorElectron): MediaService {
  const ctx = createIpcContext(el);
  reportMain.register(ctx, el.report);
  const media = createMediaService({
    resolveRepo: async (repoId) => {
      if (repoId !== CREATOR_REPO_ID) return null;
      await mkdir(el.mediaRoot, { recursive: true });
      return el.mediaRoot;
    },
    trash: el.trashItem,
    emit: el.send,
  });
  mediaCoreMain.register(ctx, {
    media,
    revealPath: el.revealPath,
    ffmpegStatus: el.ffmpegStatus,
    pickSavePath: el.pickSavePath,
    resolveVideoExportInput: async (projectId, name) => {
      const resolved = await resolveHandoffPath(projectId, 'output', name);
      return resolved.ok ? resolved.path : null;
    },
  });
  mediaDocsMain.register(ctx, { pickSavePath: el.pickSavePath, printToPdf: el.printToPdf });
  const images = createImageService({
    providers: { gemini: geminiImageProvider, openai: openaiImageProvider, agy: agyImageProvider, ollama: el.ollama ?? noOllama },
    readKey: el.readKey,
    writeFile: (req) => media.store.writeFile(req),
    emit: (event) => el.send(EVENT_CHANNELS.mediaImageProgress, event),
    fetch: el.fetch ?? ((input, init) => fetch(input, init)),
    discoverOllamaModels: async () => [],
    agyAvailable: isAgyInstalled,
  });
  mediaImagesMain.register(ctx, { images });
  // Audio: Import and the engine status work; the local MusicGen worker is not bundled with Creator
  // (its ONNX runtime lives in Studio's desktop package), so Create reports "unavailable" rather than
  // downloading a model it cannot run. No Ollama either — Expand fails inline.
  const musicBroker = createMusicBroker({ spawn: () => unavailableMusicWorker() });
  const audio = createAudioService({
    providers: { musicgen: createMusicgenProvider(musicBroker.engine), import: importAudioProvider },
    writeBytes: (req) => media.store.writeBytes(req),
    readText: (req) => media.store.readFile({ ...req, encoding: 'utf8' }),
    readFile: (absPath) => readFile(absPath),
    emit: (event) => el.send(EVENT_CHANNELS.mediaAudioProgress, event),
  });
  const musicService = createMusicService({
    listFiles: (scope) => media.store.listFiles(scope),
    readFile: (req) => media.store.readFile(req),
    writeBytes: (req) => media.store.writeBytes(req),
    removeFile: (req) => media.store.removeFile(req),
    readLocal: (absPath) => readFile(absPath),
    pickFiles: () =>
      el.pickImportFiles({ title: 'Import MIDI', filters: [{ name: 'MIDI', extensions: [...MUSIC_MIDI_FILE_EXTENSIONS] }] }),
  });
  // The editor's export: the save dialog and ffmpeg are the same ones Docs and media-core use.
  const musicExporter = createMusicExporter({
    pickSavePath: (_window, req) =>
      el.pickSavePath({
        defaultPath: join(req.defaultDir ?? '', req.defaultName),
        filters: [{ name: req.label, extensions: [req.ext] }],
      }),
    writeLocal: (path, data) => writeFile(path, data),
    transcodeMp3: async ({ exportId, wav, dest, bitrateKbps }) => {
      const ffmpeg = await el.ffmpegStatus();
      if (!ffmpeg.found) return failure(ffmpeg.reason);
      const input = join(tmpdir(), `midnite-music-${exportId}.wav`);
      await writeFile(input, wav);
      try {
        return await runFfmpegExport(
          { exportId, format: 'mp3', input, dest, options: { bitrateKbps } },
          { ffmpegPath: ffmpeg.path, emit: (event) => el.send(EVENT_CHANNELS.mediaExportProgress, event) },
        );
      } finally {
        await rm(input, { force: true });
      }
    },
    writeBytes: (req) => media.store.writeBytes(req),
    readText: (req) => media.store.readFile({ ...req, encoding: 'utf8' }),
    ensureSong: async (repoId, project, name, song) => {
      const existing = await musicService.read(repoId, project, name);
      if (existing.ok) return ok();
      const written = await musicService.write(repoId, project, name, song);
      return written.ok ? ok() : written;
    },
  });
  mediaAudioMain.register(ctx, {
    audio,
    engine: createAudioEngineServices({ broker: musicBroker }),
    installEngine: (onProgress) => musicBroker.install(onProgress),
    pickImportFiles: el.pickImportFiles,
    music: { service: musicService, exporter: musicExporter, gm: createGmSampleCache({ directory: el.videoSettingsDir }) },
  });
  // Video: the engine's projects live under Creator's one media root (`<media>/.midnite/media/video`).
  configureVideo(createProjectsStore(el.videoSettingsDir), {
    emit: el.send,
    showItemInFolder: el.revealPath,
    openPath: el.openPath,
  });
  mediaVideoMain.register(ctx, {
    resolveWorkdir: async (repoId) => {
      if (repoId !== CREATOR_REPO_ID) return null;
      await mkdir(el.mediaRoot, { recursive: true });
      return el.mediaRoot;
    },
    templateRoot: () => el.videoTemplateRoot,
  });
  return media;
}

/** `<userData>/media` — what Creator's `CREATOR_REPO_ID` resolves to. */
export const creatorMediaRoot = (userData: string): string => join(userData, 'media');
