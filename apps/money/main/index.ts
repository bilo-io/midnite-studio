import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

import { guardAppWindow, createFileSink, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import { registerMoneyHandlers } from './context';
import { MONEY_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, moneyUserData, moneyVaultDirectory } from './identity';
import { registerReport, reportMenuTemplate } from './report';
import { moneyPairing } from './pairing';

/**
 * Midnite Money's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the finance feature; the market-data key
 * is read here from the runtime vault, as `money`, and never leaves this process.
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;
let crashLog: LogSink | null = null;

app.setName(MONEY_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', moneyUserData(app.getPath('appData'), override));

// A smoke run is one-shot and must not collide with a real Money's lock.
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
    crashLog = createFileSink({ dir: app.getPath('userData'), name: 'money.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog?.write(level, message));
    crashLog.write('info', `${MONEY_NAME} ${app.getVersion()} started`);
    const sendToWindow = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send: sendToWindow },
      {
        sink: () => crashLog,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${MONEY_NAME} ${app.getVersion()}`,
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
    const vaultDirectory = moneyVaultDirectory(app.getPath('appData'), override);
    mkdirSync(vaultDirectory, { recursive: true });
    registerMoneyHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      // The runtime host's vault, over its socket: Money never reaches the keychain itself.
      vaultDirectory,
      pairing: moneyPairing(app.getPath('userData'), smoke),
      // eslint-disable-next-line no-console
      warn: (message) => console.warn(message),
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
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    title: MONEY_NAME,
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
    if (win === null || smoke) return;
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
