import { readFile } from 'node:fs/promises';

import { dialog, BrowserWindow, utilityProcess } from 'electron';

import {
  createAudioEngineServices,
  createAudioService,
  createMusicBroker,
  createMusicgenProvider,
  importAudioProvider,
  mediaAudioMain,
  musicWorkerScriptPath,
  type MusicWorkerHandle,
} from '@midnite/studio-feature-media-audio/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { getConfiguredOllamaHost, ollamaChat, ollamaTags, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { mediaStore } from './media-handlers';

/**
 * Media ▸ Audio (Phase 99 Theme E) — the `AudioProvider` catalogue and Import,
 * composed here from the `media-audio` feature (Phase 113 Theme Q). The files
 * to import come from main's own native dialog; the renderer never names an
 * absolute path.
 *
 * The local generating engine is MusicGen-small in a `utilityProcess`, forked
 * on first use — nothing loads, and nothing downloads, until the user asks.
 */
const musicBroker = createMusicBroker({
  spawn: () =>
    utilityProcess.fork(musicWorkerScriptPath(), [], { serviceName: 'mstudio-music', stdio: 'ignore' }) as MusicWorkerHandle,
});

export function configureMusicBroker(userData: string): void {
  musicBroker.configure(userData);
}

export function disposeMusicBroker(): void {
  musicBroker.dispose();
}

const ollamaBaseUrl = async (): Promise<string> => (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();

const engine = createAudioEngineServices({
  broker: musicBroker,
  ollama: {
    listModels: async () => (await ollamaTags({ baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 })).map((m) => m.name),
    // A cold 3B model takes a few seconds to load; the default 3 s probe timeout would fail every first call.
    chat: async (model, messages) => ollamaChat({ model, messages }, { baseUrl: await ollamaBaseUrl(), timeoutMs: 120_000 }),
  },
});

const audio = createAudioService({
  providers: { musicgen: createMusicgenProvider(musicBroker.engine), import: importAudioProvider },
  writeBytes: (req) => mediaStore.writeBytes(req),
  readText: (req) => mediaStore.readFile({ ...req, encoding: 'utf8' }),
  readFile: (absPath) => readFile(absPath),
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAudioProgress, event),
});

async function pickImportFiles(options: { title: string; filters: { name: string; extensions: string[] }[] }) {
  const dialogOptions = { ...options, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'> };
  const win = BrowserWindow.getFocusedWindow();
  const picked = win ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  return picked.canceled ? null : picked.filePaths;
}

export function registerMediaAudioHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('audio never trashes through this context')),
  };
  mediaAudioMain.register(ctx, {
    audio,
    engine,
    installEngine: (onProgress) => musicBroker.install(onProgress),
    pickImportFiles,
  });
}
