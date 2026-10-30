import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  createFileSink,
  guardAppWindow,
  importRetiredAppData,
  installCrashLogging,
  type LogSink,
} from '@midnite/studio-runtime';

import type { MetricsService } from '@midnite/studio-feature-monitor/main';

import { registerVanguardHost } from './host';
import { vanguardVaultPairing } from './pairing';
import {
  VANGUARD_NAME,
  SMOKE_READY_LINE,
  USER_DATA_ENV,
  vanguardRuntimeDirectory,
  vanguardUserData,
  isSmoke,
} from './identity';
import { registerReport, reportMenuTemplate } from './report';
import { registerSuiteMain, suiteRuntimeDirectory, type SuiteMain } from '@midnite/studio-runtime';

/**
 * Midnite Vanguard's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the vanguard feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
let crashLog: LogSink | null = null;
/** Quit hook from the handlers: stop the sensors and detach from the host's broker. */
let shutdownHandlers: (() => Promise<void>) | null = null;
/** Monitor's sampler, paused while the window is not in view. */
let metrics: MetricsService | null = null;

app.setName(VANGUARD_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', vanguardUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));
// Phase 124 Theme G.4: take over what the apps merged into this one left behind, once (never in a throwaway run).
if (process.env[USER_DATA_ENV] === undefined || process.env[USER_DATA_ENV] === '') importRetiredAppData({ appData: app.getPath('appData'), host: 'vanguard' });

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
    suite = registerSuiteMain({
      ipcMain,
      runtimeDirectory: suiteRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV]),
      getWindow: () => win,
      warn: (message) => process.stderr.write(`${message}\n`),
    });
    // The runtime's crash-log sink (NDJSON, rotated, redacted), the one Studio's main writes through too.
    const log = createFileSink({
      dir: app.getPath('userData'),
      name: 'vanguard.log',
      homeDir: app.getPath('home'),
    });
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
    // The window opens only once the channels are registered, so no first request finds no handler.
    void registerVanguardHost({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      homeDir: app.getPath('home'),
      // The runtime host's broker, attached as a guest: Studio's live terminals, listed and written to.
      runtimeDirectory: vanguardRuntimeDirectory(
        app.getPath('appData'),
        process.env[USER_DATA_ENV],
      ),
      openPath: (path) => shell.openPath(path),
      windowFocused: () => win !== null && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused(),
      log,
      // The Vault module: the runtime host's vault over its socket, paired under Vanguard's own key.
      directory: vanguardRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV]),
      pairing: vanguardVaultPairing(app.getPath('userData'), smoke),
      clipboard: { writeText: (text) => clipboard.writeText(text), readText: () => clipboard.readText() },
      // The Cleaner module's directory picker and the Monitor module's sampler and hand-off.
      pickDirectory: async () => {
        const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return picked.canceled ? null : (picked.filePaths[0] ?? null);
      },
      onMetricsService: (service) => {
        metrics = service;
      },
      openExternal: (url) => shell.openExternal(url),
    })
      .then(
        (registered) => {
          shutdownHandlers = registered.shutdown;
        },
        (error: unknown) => log.write('error', `Vanguard failed to start: ${String(error)}`),
      )
      .then(() => openWindow());
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
  suite?.attachWindow(win);
  // A link never loads into this window (it carries the bridge): http(s) goes to the system browser.
  guardAppWindow(win.webContents, { openExternal: (url) => shell.openExternal(url) });
  win.on('blur', () => metrics?.pause());
  win.on('focus', () => metrics?.resume());
  win.on('hide', () => metrics?.pause());
  win.on('show', () => metrics?.resume());
  win.on('minimize', () => metrics?.pause());
  win.on('restore', () => metrics?.resume());
  win.on('closed', () => {
    metrics?.stop();
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
