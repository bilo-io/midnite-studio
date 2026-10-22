import { app, clipboard, shell, type BrowserWindow } from 'electron';

import { ghStatus, runInShell } from '@midnite/studio-feature-forge/main';
import { reportMain, type GhRunner } from '@midnite/studio-feature-report/main';
import { sendToLiveWindow, type FeatureMainContext, type LogSink } from '@midnite/studio-runtime';

import { defaultLogger, getLogSink, type Logger } from '../log';
import { handle, handleBare, handleSend } from './handle';

/**
 * Studio's composition of the report feature (`@midnite/studio-feature-report/main`): the
 * renderer's crash channel, the crash log's read side and Report an Issue.
 *
 * The handlers live in the feature; this file builds it a {@link FeatureMainContext} out of
 * desktop's own `handle`/`handleBare`/`handleSend` (so payloads are parsed exactly as for every
 * other channel) and hands it what touches Electron — the log sink, `shell`, `clipboard` — plus the
 * forge's own `gh` probe and shell, so the dialog and the forge sidebar share one probe cache and
 * can never disagree about whether `gh` is signed in.
 */

/**
 * The one-line build stamp, set once at boot by `index.ts`. Kept here rather than read back off the
 * log: the bundle shows only the tail, and on a long session the boot record scrolls out of it.
 */
let bootLine = '';

export function setBootLine(line: string): void {
  bootLine = line;
}

/** Test seam and injection point. */
export type ReportDeps = {
  log?: Logger;
  /**
   * Resolved lazily on every call, not captured: handlers are registered at `handlers-registered`
   * and the sink is constructed a few lines later, once `userData` exists.
   */
  sink?: () => LogSink | null;
  homeDir?: () => string;
  gh?: GhRunner;
  getWindow?: () => BrowserWindow | null;
};

/** The forge's cached probe and its login shell — one `gh` for the whole app. */
const FORGE_GH: GhRunner = {
  status: () => ghStatus(),
  run: (command, timeoutMs) => runInShell(command, timeoutMs),
};

export function registerReportHandlers(deps: ReportDeps = {}): void {
  const log = deps.log ?? defaultLogger;
  const getWindow = deps.getWindow ?? (() => null);
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => sendToLiveWindow(getWindow, channel, payload),
    trashItem: (path) => shell.trashItem(path),
  };
  reportMain.register(ctx, {
    sink: deps.sink ?? (() => getLogSink()),
    homeDir: deps.homeDir ?? (() => app.getPath('home')),
    bootLine: () => bootLine,
    logError: (line) => log.error(line),
    gh: deps.gh ?? FORGE_GH,
    openExternal: (url) => shell.openExternal(url),
    writeClipboard: (text) => clipboard.writeText(text),
    // No path crosses the boundary — main reveals the file it owns (see `CHANNELS.reportReveal`).
    revealPath: (path) => shell.showItemInFolder(path),
  });
}
