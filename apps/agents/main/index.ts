import { mkdirSync } from 'node:fs';
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
  importRetiredAppData,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';

import { registerAgentsHandlers } from '@midnite/studio-module-agents/main';
import { AGENTS_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, agentsUserData, agentsVaultDirectory } from './identity';
import { agentsPairing } from './pairing';

/**
 * Midnite Agents's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the chats, councils, workflows and models features and the
 * MCP Tools view; the Ollama
 * cloud key is read here from the runtime vault, as `agents`, and never leaves this process.
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;

app.setName(AGENTS_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', agentsUserData(app.getPath('appData'), override));
// Phase 124 Theme G.4: take over what the apps merged into this one left behind, once (never in a throwaway run).
if (override === undefined || override === '') importRetiredAppData({ appData: app.getPath('appData'), host: 'agents' });

// A smoke run is one-shot and must not collide with a real Agents' lock.
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
    const log = createFileSink({ dir: app.getPath('userData'), name: 'agents.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    log.write('info', `${AGENTS_NAME} ${app.getVersion()} started`);
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
    const vaultDirectory = agentsVaultDirectory(app.getPath('appData'), override);
    mkdirSync(vaultDirectory, { recursive: true });
    const handlers = registerAgentsHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      // The runtime host's vault, over its socket: Agents never reaches the keychain itself.
      vaultDirectory,
      pairing: agentsPairing(app.getPath('userData'), smoke),
      pickSavePath: async (defaultName) => {
        const options = { defaultPath: defaultName, filters: [{ name: 'NDJSON', extensions: ['ndjson'] }] };
        const picked = win !== null && !win.isDestroyed() ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
        return picked.canceled || !picked.filePath ? null : picked.filePath;
      },
    });
    // A council member's or script node's shell is its own process group, so it would outlive Agents unless
    // killed here, and an in-flight workflow run must be cancelled so its node's process group dies with it.
    // Quit is held once while that finishes (a few ms; the run's own cancel poll is bounded), then finished
    // with `app.exit` — a second `app.quit()` after a prevented `will-quit` is ignored by Electron.
    let disposed = false;
    app.on('will-quit', (event) => {
      if (disposed) return;
      event.preventDefault();
      disposed = true;
      void handlers.dispose().finally(() => app.exit(0));
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
    title: AGENTS_NAME,
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
