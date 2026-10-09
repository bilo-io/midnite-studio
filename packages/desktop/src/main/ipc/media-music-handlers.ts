import { readFile } from 'node:fs/promises';

import { dialog, type BrowserWindow } from 'electron';

import { CHANNELS, MUSIC_MIDI_FILE_EXTENSIONS, failure, schemas } from '@midnite/studio-shared';

import { createMusicService } from '../media/music/music-service';
import { handle, handleFromSender } from './handle';
import { mediaStore } from './media-handlers';

/**
 * Music editor (Phase 101 Theme B) — songs as `.mid` + `.song.json` inside an Audio project. File
 * access goes through the media store's jail; Import's files come from main's own native dialog.
 */
const service = createMusicService<BrowserWindow>({
  listFiles: (scope) => mediaStore.listFiles(scope),
  readFile: (req) => mediaStore.readFile(req),
  writeBytes: (req) => mediaStore.writeBytes(req),
  removeFile: (req) => mediaStore.removeFile(req),
  readLocal: (absPath) => readFile(absPath),
  pickFiles: async (win) => {
    const options = {
      title: 'Import MIDI',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [{ name: 'MIDI', extensions: [...MUSIC_MIDI_FILE_EXTENSIONS] }],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : picked.filePaths;
  },
});

export function registerMediaMusicHandlers(): void {
  const invalid = (issue: string) => failure(issue);
  handle(CHANNELS.mediaMusicList, schemas.MediaMusicListRequest, (r) => service.list(r.repoId, r.project), invalid);
  handle(CHANNELS.mediaMusicRead, schemas.MediaMusicReadRequest, (r) => service.read(r.repoId, r.project, r.name), invalid);
  handle(
    CHANNELS.mediaMusicWrite,
    schemas.MediaMusicWriteRequest,
    (r) => service.write(r.repoId, r.project, r.name, r.song),
    invalid,
  );
  handleFromSender(
    CHANNELS.mediaMusicImport,
    schemas.MediaMusicImportRequest,
    (r, win) => service.importFiles(r.repoId, r.project, win ?? undefined),
    invalid,
  );
  handle(CHANNELS.mediaMusicDelete, schemas.MediaMusicDeleteRequest, (r) => service.remove(r.repoId, r.project, r.name), invalid);
}
