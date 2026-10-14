import { join } from 'node:path';

import { app, BrowserWindow, Menu, shell } from 'electron';

import { applyDevIdentity } from './identity';
import { registerIpc } from './ipc';

/**
 * Midnite Apps — main process.
 *
 * One window, a sandboxed renderer, a preload that exposes `window.midniteLauncher`,
 * and nothing else: no native modules, no background services, no pty. The
 * launcher's whole job is to say what is installed, install it, and open it.
 */

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    title: 'Midnite Apps',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d14',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--launcher-version=${app.getVersion()}`],
    },
  });

  // The renderer is a local page; anything that tries to leave it goes to the
  // system browser instead (only http(s) — never `file:` or a custom scheme).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Dev runs the stock Electron binary — give it the launcher's own name and Dock icon.
  applyDevIdentity(app, __dirname);

  void app.whenReady().then(() => {
    // The default menu minus the developer items a launcher has no use for.
    if (app.isPackaged) {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
          { role: 'windowMenu' },
        ]),
      );
    }
    registerIpc(() => mainWindow);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
