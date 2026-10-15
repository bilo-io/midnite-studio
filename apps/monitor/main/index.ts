import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import type { MetricsService } from '@midnite/studio-feature-monitor/main';

import { registerMonitorHandlers } from './context';
import { createCrashLog } from './crash-log';
import { MONITOR_NAME, SMOKE_READY_LINE, USER_DATA_ENV, monitorUserData, isSmoke } from './identity';

/**
 * Midnite Monitor's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the monitor feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let metrics: MetricsService | null = null;

app.setName(MONITOR_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', monitorUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));

// A smoke run is one-shot and must not collide with a real Monitor's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win === null) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    const log = createCrashLog(join(app.getPath('userData'), 'monitor.log'), app.getPath('home'));
    process.on('uncaughtException', (error) => log.write('error', `uncaught: ${error.stack ?? error.message}`));
    process.on('unhandledRejection', (reason) => log.write('error', `unhandled rejection: ${String(reason)}`));
    log.write('info', `${MONITOR_NAME} ${app.getVersion()} started`);
    registerMonitorHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      onMetricsService: (service) => {
        metrics = service;
      },
      log,
    });
    openWindow();
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
    title: MONITOR_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Sampling is tied to whether anyone can see the window: a hidden Monitor must not spawn `ioreg` for hours.
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
