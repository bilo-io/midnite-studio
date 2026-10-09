import { readFile } from 'node:fs/promises';

import { dialog, type BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, MUSIC_MIDI_FILE_EXTENSIONS, failure, schemas } from '@midnite/studio-shared';

import { createMusicTools } from '../media/music/music-mcp';
import { createMusicService } from '../media/music/music-service';
import { setMusicTools } from '../mcp/music-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows } from '../window-manager';
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

/**
 * The `music_*` MCP tools (Phase 101 Theme H): thin adapters over this file's own song service, so an
 * agent's edit lands in the same `.mid` + `.song.json` the editor writes. Every tool that changes a
 * song sits behind the `allowMusic` switch (`mcp/music-tools.ts`); edits are broadcast to every window
 * as one `music-changed` event each, and `music_open` as `music-open`.
 */
export const musicTools = createMusicTools({
  resolveRepo: async (repoPath) => {
    const resolved = await resolveRegisteredRepo(repoPath);
    if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
    return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
  },
  listProjects: (repoId) => mediaStore.listProjects({ repoId, tab: 'audio' }),
  listSongs: (repoId, project) => service.list(repoId, project),
  readSong: (repoId, project, name) => service.read(repoId, project, name),
  writeSong: (repoId, project, name, song) => service.write(repoId, project, name, song),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMusicChanged, event),
  emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaMusicOpen, event),
});
setMusicTools(musicTools);

export const musicService = service;

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
