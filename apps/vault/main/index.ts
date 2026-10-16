import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';

import { registerVaultHandlers } from './context';
import { VAULT_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, vaultDirectory, vaultUserData } from './identity';

/**
 * Midnite Vault's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the vault feature; the runtime vault is
 * composed here over the runtime's data directory, with `safeStorage` as its cipher.
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;

app.setName(VAULT_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', vaultUserData(app.getPath('appData'), override));

// A smoke run is one-shot and must not collide with a real Vault's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win === null) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    const directory = vaultDirectory(app.getPath('appData'), override);
    mkdirSync(directory, { recursive: true });
    registerVaultHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      directory,
      // A smoke run must never reach the keychain: encryption reads as unavailable, so nothing is stored.
      cipher: smoke ? NO_KEYCHAIN : safeStorage,
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
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: VAULT_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
