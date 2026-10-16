import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createMediaService, mediaCoreMain, type MediaService } from '@midnite/studio-feature-media-core/main';
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
import { EVENT_CHANNELS, type FfmpegStatus, type SecretKey } from '@midnite/studio-shared';

/**
 * The one "repository" Creator's media is scoped to. The renderer's media store addresses
 * everything by `repoId`; Creator has no repository list, so it has one id that main resolves to
 * its own media root (`<userData>/media`, holding `.midnite/media/<tab>/`).
 */
export const CREATOR_REPO_ID = 'creator';

/** The electron pieces Creator's main needs, injected so registration is testable under bare vitest. */
export type CreatorElectron = IpcContextElectron & {
  /** The folder that holds `.midnite/media/` — `<userData>/media` in the app, a temp dir under test. */
  mediaRoot: string;
  revealPath: (absPath: string) => void;
  pickSavePath: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  printToPdf: (htmlFile: string) => Promise<Buffer>;
  ffmpegStatus: () => Promise<FfmpegStatus>;
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
 * Docs' export (no Ask AI — Creator has no agents), and Images' generation. Returns the media
 * service so the caller can stop its watchers on quit.
 */
export function registerCreatorHandlers(el: CreatorElectron): MediaService {
  const ctx = createIpcContext(el);
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
  return media;
}

/** `<userData>/media` — what Creator's `CREATOR_REPO_ID` resolves to. */
export const creatorMediaRoot = (userData: string): string => join(userData, 'media');
