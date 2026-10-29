import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, clipboard, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';

import { createFileSink, guardAppWindow, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import { registerVaultHandlers } from '@midnite/studio-module-vault/main';
import { VAULT_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, vaultDirectory, vaultUserData } from './identity';
import { vaultPairing } from './pairing';
import { registerReport, reportMenuTemplate } from './report';

/**
 * Midnite Vault's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the vault feature; the runtime vault is
 * reached here as the runtime host's (Studio's, over its socket under the runtime's data directory);
 * Vault holds no cipher of its own.
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;
let log: LogSink | null = null;

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
    // The runtime's crash-log sink (NDJSON, rotated, redacted) — what Report an Issue reads.
    log = createFileSink({ dir: app.getPath('userData'), name: 'vault.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log?.write(level, message));
    log.write('info', `${VAULT_NAME} ${app.getVersion()} started`);
    const send = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send },
      {
        sink: () => log,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${VAULT_NAME} ${app.getVersion()}`,
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
    registerVaultHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send,
      // The runtime host's vault, over its socket: Vault never reaches the keychain itself.
      directory,
      pairing: vaultPairing(app.getPath('userData'), smoke),
      clipboard: {
        writeText: (text) => clipboard.writeText(text),
        readText: () => clipboard.readText(),
      },
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
