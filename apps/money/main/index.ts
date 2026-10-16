import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';

import { registerMoneyHandlers } from './context';
import { MONEY_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, moneyUserData, moneyVaultDirectory } from './identity';

/**
 * Midnite Money's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the finance feature; the market-data key
 * is read here from the runtime vault, as `money`, and never leaves this process.
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;

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
    const vaultDirectory = moneyVaultDirectory(app.getPath('appData'), override);
    mkdirSync(vaultDirectory, { recursive: true });
    registerMoneyHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      vaultDirectory,
      // A smoke run must never reach the keychain: encryption reads as unavailable, so nothing is read.
      cipher: smoke ? NO_KEYCHAIN : safeStorage,
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

const NO_KEYCHAIN = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.alloc(0),
  decryptString: () => '',
};

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
  // Money has no embedded browser: a link the renderer opens goes to the system browser, https only.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
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
