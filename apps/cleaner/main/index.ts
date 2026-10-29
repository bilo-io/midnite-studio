import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  buildSuiteMenuTemplate,
  createFileSink,
  guardAppWindow,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';

import { registerCleanerHandlers } from '@midnite/studio-module-cleaner/main';
import { CLEANER_NAME, SMOKE_READY_LINE, USER_DATA_ENV, cleanerUserData, isSmoke } from './identity';

/**
 * Midnite Cleaner's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the optimizer feature, registered through a
 * `FeatureMainContext` built from the runtime; no desktop, no other app.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;

app.setName(CLEANER_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', cleanerUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));

// A smoke run is one-shot and must not collide with a real Cleaner's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win === null) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    // Crash log + Report an Issue: the runtime's file sink, the app's own Help menu item, and the report feature's services.
    const log = createFileSink({ dir: app.getPath('userData'), name: 'cleaner.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    log.write('info', `${CLEANER_NAME} ${app.getVersion()} started`);
    app.on('will-quit', () => log.close());
    const reportServices = {
      sink: () => log,
      homeDir: () => app.getPath('home'),
      openExternal: (url: string) => shell.openExternal(url),
      writeClipboard: (text: string) => clipboard.writeText(text),
      revealPath: (path: string) => shell.showItemInFolder(path),
    };
    // The menu's Report an Issue… reaches the focused window, falling back to the main one.
    const sendToFocused = (channel: string, payload: unknown): void => {
      const target = BrowserWindow.getFocusedWindow() ?? win;
      if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload);
    };
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildSuiteMenuTemplate({ reportItem: reportIssueMenuItem(sendToFocused) }) as MenuItemConstructorOptions[],
      ),
    );
    registerCleanerHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      pickDirectory: async () => {
        const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return picked.canceled ? null : (picked.filePaths[0] ?? null);
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
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: CLEANER_NAME,
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
