import { readFile } from 'node:fs/promises';

import { dialog } from 'electron';

import {
  AUDIO_LOCAL_MODEL_BYTES,
  AUDIO_OLLAMA_RECOMMENDED,
  CHANNELS,
  EVENT_CHANNELS,
  AUDIO_FILE_EXTENSIONS,
  failure,
  schemas,
  type AudioEngineStatus,
} from '@midnite/studio-shared';

import { createAudioService } from '../media/audio/audio-service';
import { importAudioProvider } from '../media/audio/import-adapter';
import { createMusicBroker } from '../media/audio/musicgen/music-broker';
import { createMusicgenProvider } from '../media/audio/musicgen/provider';
import { expandPrompt, pickOllamaModel } from '../media/audio/ollama-expand';
import { ollamaChat, ollamaTags, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleFromSender } from './handle';
import { mediaStore } from './media-handlers';

/**
 * Media ▸ Audio (Phase 99 Theme E) — the `AudioProvider` catalogue and Import.
 * The files to import come from main's own native dialog; the renderer never
 * names an absolute path.
 */
/**
 * The local generating engine: MusicGen-small in a `utilityProcess`, forked on
 * first use — nothing loads, and nothing downloads, until the user asks.
 */
const musicBroker = createMusicBroker();

export function configureMusicBroker(userData: string): void {
  musicBroker.configure(userData);
}

export function disposeMusicBroker(): void {
  musicBroker.dispose();
}

const ollamaBaseUrl = async (): Promise<string> => (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();

async function installedOllamaModels(): Promise<string[]> {
  return (await ollamaTags({ baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 })).map((m) => m.name);
}

async function engineStatus(): Promise<AudioEngineStatus> {
  const [music, installed] = await Promise.all([
    musicBroker.status(),
    installedOllamaModels().then(
      (models) => ({ running: true, models }),
      () => ({ running: false, models: [] as string[] }),
    ),
  ]);
  return {
    musicgen: {
      state: music.state,
      downloadBytes: music.state === 'ready' ? 0 : AUDIO_LOCAL_MODEL_BYTES,
      ...(music.reason ? { reason: music.reason } : {}),
    },
    ollama: { ...installed, model: pickOllamaModel(installed.models), recommended: AUDIO_OLLAMA_RECOMMENDED },
  };
}

const service = createAudioService({
  providers: { musicgen: createMusicgenProvider(musicBroker.engine), import: importAudioProvider },
  writeBytes: (req) => mediaStore.writeBytes(req),
  readText: (req) => mediaStore.readFile({ ...req, encoding: 'utf8' }),
  readFile: (absPath) => readFile(absPath),
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAudioProgress, event),
});

export function registerMediaAudioHandlers(): void {
  handleBare(CHANNELS.mediaAudioProviders, () => ({ providers: service.providerStatuses() }));
  handleBare(CHANNELS.mediaAudioEngine, async () => ({ engine: await engineStatus() }));
  handleBare(CHANNELS.mediaAudioEngineInstall, () =>
    musicBroker.install((progress) => broadcastToAllWindows(EVENT_CHANNELS.mediaAudioEngineProgress, progress)),
  );
  handle(CHANNELS.mediaAudioGenerate, schemas.MediaAudioGenerateRequest, (req) => service.generate(req), (issue) => failure(issue));
  handle(CHANNELS.mediaAudioCancel, schemas.MediaAudioCancelRequest, ({ importId }) => service.cancel(importId), (issue) => failure(issue));
  handle(
    CHANNELS.mediaAudioExpand,
    schemas.MediaAudioExpandRequest,
    async (req) =>
      expandPrompt(req, {
        listModels: installedOllamaModels,
        // A cold 3B model takes a few seconds to load; the default 3 s probe timeout would fail every first call.
        chat: async (model, messages) => ollamaChat({ model, messages }, { baseUrl: await ollamaBaseUrl(), timeoutMs: 120_000 }),
      }),
    (issue) => failure(issue),
  );
  handleFromSender(
    CHANNELS.mediaAudioImport,
    schemas.MediaAudioImportRequest,
    async (req, win) => {
      try {
        const options = {
          title: 'Import audio',
          properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
          filters: [{ name: 'Audio', extensions: [...AUDIO_FILE_EXTENSIONS] }],
        };
        const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        if (picked.canceled || picked.filePaths.length === 0) return failure('cancelled');
        return await service.importFiles(req, picked.filePaths);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
}
