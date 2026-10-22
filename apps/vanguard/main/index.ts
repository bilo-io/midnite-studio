import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

import { createFileSink, guardAppWindow, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import { registerVanguardHandlers } from './context';
import { VANGUARD_NAME, SMOKE_READY_LINE, USER_DATA_ENV, vanguardRuntimeDirectory, vanguardUserData, isSmoke } from './identity';
import { registerReport, reportMenuTemplate } from './report';

/**
 * Midnite Vanguard's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the vanguard feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let crashLog: LogSink | null = null;
/** Quit hook from the handlers: stop the sensors and detach from the host's broker. */
let shutdownHandlers: (() => Promise<void>) | null = null;

app.setName(VANGUARD_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', vanguardUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));

// A smoke run is one-shot and must not collide with a real Vanguard's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win === null) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    // The runtime's crash-log sink (NDJSON, rotated, redacted), the one Studio's main writes through too.
    const log = createFileSink({ dir: app.getPath('userData'), name: 'vanguard.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    crashLog = log;
    log.write('info', `${VANGUARD_NAME} ${app.getVersion()} started`);
    const sendToWindow = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send: sendToWindow },
      {
        sink: () => crashLog,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${VANGUARD_NAME} ${app.getVersion()}`,
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
    void registerVanguardHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      homeDir: app.getPath('home'),
      // The runtime host's broker, attached as a guest: Studio's live terminals, listed and written to.
      runtimeDirectory: vanguardRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV]),
      openPath: (path) => shell.openPath(path),
      log,
    }).then(
      (registered) => {
        shutdownHandlers = registered.shutdown;
      },
      (error: unknown) => log.write('error', `Vanguard failed to start: ${String(error)}`),
    );
    openWindow();
  });

  app.on('window-all-closed', () => app.quit());
  // Quit: stop the sensors and detach from the host's broker (its sessions keep running).
  app.on('before-quit', () => {
    const stop = shutdownHandlers;
    shutdownHandlers = null;
    void stop?.();
  });
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
    title: VANGUARD_NAME,
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
