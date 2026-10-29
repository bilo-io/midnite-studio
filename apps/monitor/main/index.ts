import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

import { bindMetricsToWindow, createFileSink, guardAppWindow, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import type { MetricsService } from '@midnite/studio-feature-monitor/main';

import { createMonitorSessions, registerMonitorHandlers } from '@midnite/studio-module-monitor/main';
import { MONITOR_NAME, SMOKE_READY_LINE, USER_DATA_ENV, monitorRuntimeDirectory, monitorUserData, isSmoke } from './identity';
import { registerReport, reportMenuTemplate } from './report';

/**
 * Midnite Monitor's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the monitor feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let crashLog: LogSink | null = null;
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
    // The runtime's crash-log sink (NDJSON, rotated, redacted), the one Studio's main writes through too.
    const log = createFileSink({ dir: app.getPath('userData'), name: 'monitor.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    crashLog = log;
    log.write('info', `${MONITOR_NAME} ${app.getVersion()} started`);
    const sendToWindow = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send: sendToWindow },
      {
        sink: () => crashLog,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${MONITOR_NAME} ${app.getVersion()}`,
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
    registerMonitorHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      onMetricsService: (service) => {
        metrics = service;
      },
      homeDir: app.getPath('home'),
      openExternal: (url) => shell.openExternal(url),
      // The runtime host's broker, attached read-only: Studio's live terminals and their agents.
      ...createMonitorSessions(monitorRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV])),
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
  // A link never loads into this window (it carries the bridge): http(s) goes to the system browser.
  guardAppWindow(win.webContents, { openExternal: (url) => shell.openExternal(url) });
  // Sampling is tied to whether anyone can see the window: a hidden Monitor must not spawn `ioreg` for hours.
  // `metrics` is handed over by `registerMonitorHandlers` before the window exists.
  if (metrics !== null) bindMetricsToWindow(win, metrics);
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
