import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

import { guardAppWindow, createFileSink, importRetiredAppData, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import type { NotesStore } from '@midnite/studio-feature-notes/main';

import { registerMindHandlers } from '@midnite/studio-module-mind/main';
import { MIND_NAME, SMOKE_READY_LINE, USER_DATA_ENV, mindUserData, isSmoke } from './identity';
import { registerReport, reportMenuTemplate } from './report';

/**
 * Midnite Mind's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the notes feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app. Notes are stored under
 * Mind's own userData (`Midnite Runtime/apps/mind/notes/`), never Studio's.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let crashLog: LogSink | null = null;
let store: NotesStore | null = null;
let flushed = false;

app.setName(MIND_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', mindUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));
// Phase 124 Theme G.4: take over what the apps merged into this one left behind, once (never in a throwaway run).
if (process.env[USER_DATA_ENV] === undefined || process.env[USER_DATA_ENV] === '') importRetiredAppData({ appData: app.getPath('appData'), host: 'mind' });

// A smoke run is one-shot and must not collide with a real Mind's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win === null) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    // The runtime's crash-log sink (NDJSON, rotated, redacted) — what Report an Issue reads.
    crashLog = createFileSink({ dir: app.getPath('userData'), name: 'mind.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog?.write(level, message));
    crashLog.write('info', `${MIND_NAME} ${app.getVersion()} started`);
    const sendToWindow = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send: sendToWindow },
      {
        sink: () => crashLog,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${MIND_NAME} ${app.getVersion()}`,
        openExternal: (url) => shell.openExternal(url),
        writeClipboard: (text) => clipboard.writeText(text),
        revealPath: (path) => shell.showItemInFolder(path),
      },
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        reportMenuTemplate((channel, payload) => {
          const target = BrowserWindow.getFocusedWindow() ?? win;
          if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload);
        }) as MenuItemConstructorOptions[],
      ),
    );
    store = registerMindHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      notesDirectory: app.getPath('userData'),
      knowledgeCacheDirectory: join(app.getPath('userData'), 'knowledge-cache'),
      // eslint-disable-next-line no-console
      warn: (issue) => console.warn(`[mind] ${issue}`),
    });
    openWindow();
  });

  // Writes are debounced: hold the quit until the last one is on disk.
  app.on('before-quit', (event) => {
    if (flushed || store === null) return;
    event.preventDefault();
    flushed = true;
    void store.flush().finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (win === null) openWindow();
  });
}

function openWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: MIND_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // A link never loads into this window (it carries the bridge): http(s) goes to the system browser.
  guardAppWindow(win.webContents, { openExternal: (url) => shell.openExternal(url) });
  win.on('closed', () => {
    win = null;
  });
  win.once('ready-to-show', () => {
    if (win === null) return;
    if (smoke) return;
    win.show();
  });
  if (smoke) {
    win.webContents.once('did-finish-load', () => {
      // eslint-disable-next-line no-console
      console.log(SMOKE_READY_LINE);
      app.quit();
    });
  }
  void win.loadFile(join(__dirname, 'index.html'));
}
