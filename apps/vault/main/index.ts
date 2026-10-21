import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { guardAppWindow } from '@midnite/studio-runtime';

import { registerVaultHandlers } from './context';
import { VAULT_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, vaultDirectory, vaultUserData } from './identity';
import { vaultPairing } from './pairing';

/**
 * Midnite Vault's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the vault feature; the runtime vault is
 * reached here as the runtime host's (Studio's, over its socket under the runtime's data directory);
 * Vault holds no cipher of its own.
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
      // The runtime host's vault, over its socket: Vault never reaches the keychain itself.
      directory,
      pairing: vaultPairing(app.getPath('userData'), smoke),
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
