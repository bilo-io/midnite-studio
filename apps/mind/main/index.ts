import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { guardAppWindow } from '@midnite/studio-runtime';

import type { NotesStore } from '@midnite/studio-feature-notes/main';

import { registerMindHandlers } from './context';
import { MIND_NAME, SMOKE_READY_LINE, USER_DATA_ENV, mindUserData, isSmoke } from './identity';

/**
 * Midnite Mind's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the notes feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app. Notes are stored under
 * Mind's own userData (`Midnite Runtime/apps/mind/notes/`), never Studio's.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let store: NotesStore | null = null;
let flushed = false;

app.setName(MIND_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', mindUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));

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
    store = registerMindHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      notesDirectory: app.getPath('userData'),
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
