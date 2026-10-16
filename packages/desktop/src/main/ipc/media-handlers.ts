import { AsyncLocalStorage } from 'node:async_hooks';

import { BrowserWindow, dialog, shell } from 'electron';

import { createMediaService, mediaCoreMain } from '@midnite/studio-feature-media-core/main';
import { mediaDocsMain } from '@midnite/studio-feature-media-docs/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import type { FfmpegStatus, MediaTab } from '@midnite/studio-shared';

import { runDocEdit } from '../ai/doc-edit';
import { resolveWorkdir } from '../repo-registry';
import { resolveHandoffPath } from '@midnite/studio-feature-media-video/main';
import { probeBinary } from '../system-health';
import { broadcastToAllWindows } from '../window-manager';
import { handleBare, handleFromSender, handleSend } from './handle';

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

  // --- Docs (Theme B) — the Docs feature's main half (Phase 113 Theme Q) ------
  mediaDocsMain.register(ctx, {
    pickSavePath,
    printToPdf: printHtmlFileToPdf,
    runDocEdit: async (req) =>
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
  });
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
