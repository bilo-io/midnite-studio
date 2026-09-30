import { readFile } from 'node:fs/promises';

import { dialog } from 'electron';

import { AUDIO_FILE_EXTENSIONS, CHANNELS, EVENT_CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { createAudioService } from '../media/audio/audio-service';
import { importAudioProvider } from '../media/audio/import-adapter';
import { broadcastToAllWindows } from '../window-manager';
import { handleBare, handleFromSender } from './handle';
import { mediaStore } from './media-handlers';

/**
 * Media ▸ Audio (Phase 99 Theme E) — the `AudioProvider` catalogue and Import.
 * The files to import come from main's own native dialog; the renderer never
 * names an absolute path.
 */
const service = createAudioService({
  providers: { import: importAudioProvider },
  writeBytes: (req) => mediaStore.writeBytes(req),
  readText: (req) => mediaStore.readFile({ ...req, encoding: 'utf8' }),
  readFile: (absPath) => readFile(absPath),
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAudioProgress, event),
});

export function registerMediaAudioHandlers(): void {
  handleBare(CHANNELS.mediaAudioProviders, () => ({ providers: service.providerStatuses() }));
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
