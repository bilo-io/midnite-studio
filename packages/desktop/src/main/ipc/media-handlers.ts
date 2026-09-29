import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

import { dialog, shell } from 'electron';

import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  MEDIA_ROOT_DIR,
  MEDIA_TABS,
  ok,
  schemas,
  type FfmpegStatus,
  type GitOpResult,
  type MediaTab,
} from '@midnite/studio-shared';

import { cancelFfmpegExport, isFfmpegFormat, runFfmpegExport } from '../media/export-service';
import { createMediaStore } from '../media/media-store';
import { resolveWorkdir } from '../repo-registry';
import { probeBinary } from '../system-health';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleFromSender } from './handle';

/**
 * Media page (Phase 99 Theme A) — the repo-scoped media store, its watcher,
 * the ffmpeg probe and the export service. `media-store.ts` owns the jail;
 * this file forwards, wraps every op so a thrown fs error still answers the
 * `GitOpResult` envelope, and fans `mediaChanged` out to every window.
 */

const CHANGE_DEBOUNCE_MS = 150;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function emitChanged(repoId: string, tab: MediaTab): void {
  const key = `${repoId}\0${tab}`;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      broadcastToAllWindows(EVENT_CHANNELS.mediaChanged, { repoId, tab });
    }, CHANGE_DEBOUNCE_MS),
  );
}

const store = createMediaStore({
  resolveRepo: (repoId) => resolveWorkdir(repoId),
  trash: (absPath) => shell.trashItem(absPath),
  onChanged: (repoId, tab) => {
    emitChanged(repoId, tab);
    void ensureWatcher(repoId);
  },
});

/** One recursive watcher per repo on `<repo>/.midnite/media`, started lazily. */
const watchers = new Map<string, FSWatcher>();

async function ensureWatcher(repoId: string): Promise<void> {
  if (watchers.has(repoId)) return;
  const repoPath = await resolveWorkdir(repoId);
  if (!repoPath) return;
  try {
    const watcher = watch(join(repoPath, MEDIA_ROOT_DIR), { recursive: true }, (_event, filename) => {
      const tab = String(filename ?? '').split(/[\\/]/)[0] as MediaTab;
      if ((MEDIA_TABS as readonly string[]).includes(tab)) emitChanged(repoId, tab);
    });
    watcher.on('error', () => {
      watcher.close();
      watchers.delete(repoId);
    });
    watchers.set(repoId, watcher);
  } catch {
    // No media folder yet — the first write starts the watcher.
  }
}

export function stopMediaWatchers(): void {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
}

const guard = async <R extends GitOpResult<unknown> | GitOpResult>(run: () => Promise<R>): Promise<R | GitOpResult> => {
  try {
    return await run();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
};

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];

export async function ffmpegStatus(): Promise<FfmpegStatus> {
  const probe = await probeBinary('ffmpeg', FFMPEG_CANDIDATES);
  return probe.path
    ? { found: true, path: probe.path, version: probe.version }
    : { found: false, reason: 'ffmpeg was not found. Install it with Homebrew to enable exports.' };
}

export function registerMediaHandlers(): void {
  handle(
    CHANNELS.mediaProjectList,
    schemas.MediaProjectListRequest,
    (req) =>
      guard(async () => {
        void ensureWatcher(req.repoId);
        return store.listProjects(req);
      }),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaProjectCreate,
    schemas.MediaProjectCreateRequest,
    (req) => guard(() => store.createProject(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaProjectRename,
    schemas.MediaProjectRenameRequest,
    (req) => guard(() => store.renameProject(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaProjectRemove,
    schemas.MediaProjectRemoveRequest,
    (req) => guard(() => store.removeProject(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaFileList,
    schemas.MediaFileListRequest,
    (req) => guard(() => store.listFiles(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaFileRead,
    schemas.MediaFileReadRequest,
    (req) => guard(() => store.readFile(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaFileWrite,
    schemas.MediaFileWriteRequest,
    (req) => guard(() => store.writeFile(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaFileRename,
    schemas.MediaFileRenameRequest,
    (req) => guard(() => store.renameFile(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaFileRemove,
    schemas.MediaFileRemoveRequest,
    (req) => guard(() => store.removeFile(req)),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaReveal,
    schemas.MediaRevealRequest,
    (req) =>
      guard(async () => {
        const target = await store.resolveForReveal(req);
        if (!target) return failure('Not found.');
        shell.showItemInFolder(target);
        return ok();
      }),
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.mediaFfmpegStatus, async () => ({ ffmpeg: await ffmpegStatus() }));

  handleFromSender(
    CHANNELS.mediaExport,
    schemas.MediaExportRequest,
    (req, win) =>
      guard(async () => {
        if (!isFfmpegFormat(req.format)) return failure(`${req.format} is not an ffmpeg export.`);
        const ffmpeg = await ffmpegStatus();
        if (!ffmpeg.found) return failure(ffmpeg.reason);
        const input = await store.resolveForRead(req.source);
        if (!input) return failure('Source file not found.');
        const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[req.format];
        const stem = req.source.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'export';
        const options = {
          defaultPath: join(req.defaultDir ?? '', `${stem}.${ext}`),
          filters: [{ name: label, extensions: [ext] }],
        };
        const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
        if (picked.canceled || !picked.filePath) return failure('cancelled');
        return runFfmpegExport(
          { exportId: req.exportId, format: req.format, input, dest: picked.filePath, options: req.options },
          {
            ffmpegPath: ffmpeg.path,
            emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaExportProgress, event),
          },
        );
      }),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.mediaExportCancel,
    schemas.MediaExportCancelRequest,
    ({ exportId }) => cancelFfmpegExport(exportId),
    (issue) => failure(issue),
  );
}
