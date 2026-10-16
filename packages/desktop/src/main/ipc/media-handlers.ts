import { AsyncLocalStorage } from 'node:async_hooks';

import { BrowserWindow, dialog, shell } from 'electron';

import { createMediaService, mediaCoreMain } from '@midnite/studio-feature-media-core/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import {
  CHANNELS,
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  schemas,
  type FfmpegStatus,
  type GitOpResult,
  type MediaTab,
} from '@midnite/studio-shared';

import { runDocEdit } from '../ai/doc-edit';
import { exportDoc } from '../media/doc-export';
import { resolveWorkdir } from '../repo-registry';
import { resolveHandoffPath } from '../video-service';
import { probeBinary } from '../system-health';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleFromSender, handleSend } from './handle';

/**
 * Media page (Phase 99 Theme A) — Studio's composition of media-core's main
 * half (Phase 113 Theme Q): the repo-scoped store, its watcher and the ffmpeg
 * export are the feature's; this file builds them over Studio's repository
 * registry, Finder, the save dialog and `broadcastToAllWindows`.
 *
 * The save dialog sheets on the window that asked: every media-core channel
 * is registered through `handleFromSender`, and the sender's window rides an
 * `AsyncLocalStorage` into `pickSavePath` — the handler itself never sees it.
 */

const media = createMediaService({
  resolveRepo: (repoId) => resolveWorkdir(repoId),
  trash: (absPath) => shell.trashItem(absPath),
  emit: broadcastToAllWindows,
});

/** Shared with the other media handlers, which write through the same jail. */
export const mediaStore = media.store;

/** Ping the renderer (debounced) and make sure the repo's media watcher runs — for writers that bypass the store. */
export function notifyMediaChanged(repoId: string, tab: MediaTab): void {
  media.notifyChanged(repoId, tab);
}

export function stopMediaWatchers(): void {
  media.stopWatchers();
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

/** The window whose request is being handled — what the save dialog sheets on. */
const senderWindow = new AsyncLocalStorage<BrowserWindow | null>();

async function pickSavePath(options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) {
  const win = senderWindow.getStore() ?? null;
  const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return picked.canceled || !picked.filePath ? null : picked.filePath;
}

export function registerMediaHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: {
      handle: (channel, schema, handler, onInvalid) =>
        handleFromSender(channel, schema, (payload, win) => senderWindow.run(win, () => handler(payload)), onInvalid),
      handleBare,
      send: handleSend,
    },
    emit: broadcastToAllWindows,
    trashItem: (path) => shell.trashItem(path),
  };
  mediaCoreMain.register(ctx, {
    media,
    revealPath: (target) => shell.showItemInFolder(target),
    ffmpegStatus,
    pickSavePath,
    resolveVideoExportInput: async (projectId, name) => {
      const resolved = await resolveHandoffPath(projectId, 'output', name);
      return resolved.ok ? resolved.path : null;
    },
  });

  // --- Docs (Theme B) --------------------------------------------------------
  handle(
    CHANNELS.mediaDocEdit,
    schemas.MediaDocEditRequest,
    (req) =>
      guard(async () =>
        runDocEdit({
          docName: req.path,
          markdown: req.markdown,
          selection: req.selection,
          prompt: req.prompt,
          agentId: req.agentId,
          model: req.model,
          ollamaModel: req.ollamaModel,
          repoPath: (await resolveWorkdir(req.repoId)) ?? null,
        }),
      ),
    (issue) => failure(issue),
  );

  handleFromSender(
    CHANNELS.mediaDocExport,
    schemas.MediaDocExportRequest,
    (req, win) =>
      guard(() =>
        exportDoc(req, {
          pickDest: async (defaultPath, format) => {
            const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[format];
            const options = { defaultPath, filters: [{ name: label, extensions: [ext] }] };
            const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
            return picked.canceled || !picked.filePath ? null : picked.filePath;
          },
          printToPdf: printHtmlFileToPdf,
        }),
      ),
    (issue) => failure(issue),
  );
}

/**
 * A hidden, script-less window prints the doc's standalone HTML. Scripts are
 * off: the HTML is the user's own markdown rendered, and nothing in it needs
 * to run for the PDF to look right.
 */
async function printHtmlFileToPdf(htmlFile: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadFile(htmlFile);
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    win.destroy();
  }
}
