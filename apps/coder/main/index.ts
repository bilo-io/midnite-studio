import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  shell,
  utilityProcess,
  type MenuItemConstructorOptions,
} from 'electron';

import type { ScriptWorkerHandle } from '@midnite/studio-feature-api-client/main';
import { ghStatus, runInShell } from '@midnite/studio-feature-forge/main';
import {
  buildSuiteMenuTemplate,
  createFileSink,
  guardAppWindow,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';

import { registerCoderHandlers } from '@midnite/studio-module-coder/main';
import { CODER_NAME, coderUserData, coderVaultDirectory, isSmoke, SMOKE_READY_LINE, USER_DATA_ENV } from './identity';
import { coderPairing } from './pairing';

/**
 * Midnite Coder's main process — the entry the bundle's `package.json` names (`main.cjs`), run by the
 * launcher's stub as `Resources/app`. One window over the forge and tests features and Coder's own
 * repository list. Forge tokens are read here from the runtime vault, as `coder` behind the grants,
 * and never leave this process; a repository's forge comes from its `.git/config`, read-only, and its
 * graph from the system git, read-only too (`git.ts`, `system-git.ts`).
 */
const smoke = isSmoke(process.env);
const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;
/** Quit hook from the handlers: abort running collection runs, kill the script worker, drop database connections. */
let shutdownHandlers: (() => Promise<void>) | null = null;

app.setName(CODER_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', coderUserData(app.getPath('appData'), override));

// A smoke run is one-shot and must not collide with a real Coder's lock.
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
    const log = createFileSink({ dir: app.getPath('userData'), name: 'coder.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    log.write('info', `${CODER_NAME} ${app.getVersion()} started`);
    app.on('will-quit', () => log.close());
    const reportServices = {
      sink: () => log,
      // The forge's cached `gh` probe and login shell, so the dialog and the Reviews tab never disagree about sign-in.
      gh: { status: () => ghStatus(), run: (command: string, timeoutMs: number) => runInShell(command, timeoutMs) },
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
    const vaultDirectory = coderVaultDirectory(app.getPath('appData'), override);
    mkdirSync(vaultDirectory, { recursive: true });
    const registered = registerCoderHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      userData: app.getPath('userData'),
      // The runtime host's vault, over its socket: Coder never reaches the keychain itself.
      vaultDirectory,
      pairing: coderPairing(app.getPath('userData'), smoke),
      // The agent-run hand-off's link: main's opener only ever passes a re-parsed `midnite://open` here.
      openExternal: (url) => shell.openExternal(url),
      pickDirectory: async () => {
        const options = { title: 'Add a repository', properties: ['openDirectory' as const] };
        const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      senderWindowId: (event) => {
        const sender = (event as { sender?: Electron.WebContents }).sender;
        return sender ? (BrowserWindow.fromWebContents(sender)?.id ?? null) : null;
      },
      onWindowClosed: (windowId, fn) => BrowserWindow.fromId(windowId)?.once('closed', fn),
      windows: {
        anyWindowVisible: () => BrowserWindow.getAllWindows().some((w) => w.isVisible() && !w.isMinimized()),
        idleState: () => powerMonitor.getSystemIdleState(60),
      },
      dialogs: {
        // The native pickers; the renderer never names a path, only an outcome comes back.
        pickFile: async ({ title, filters }) => {
          const options = { title, properties: ['openFile' as const], ...(filters ? { filters } : {}) };
          const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
          return picked.canceled ? null : (picked.filePaths[0] ?? null);
        },
        pickSavePath: async ({ title, defaultPath }) => {
          const options = { title, ...(defaultPath ? { defaultPath } : {}) };
          const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
          return picked.canceled || !picked.filePath ? null : picked.filePath;
        },
      },
      // The sandboxed `pm.*` script runner is its own OS process — no Electron APIs, no main-process
      // privileges — built beside this bundle as `script-runner-worker.cjs` and killed on quit.
      scriptWorker: () =>
        utilityProcess.fork(join(__dirname, 'script-runner-worker.cjs'), [], {
          serviceName: 'midnite-coder-script-runner',
          stdio: 'ignore',
        }) as unknown as ScriptWorkerHandle,
      // eslint-disable-next-line no-console
      warn: (message) => console.warn(`[coder] ${message}`),
    });
    shutdownHandlers = registered.shutdown;
    openWindow();
  });

  app.on('before-quit', () => {
    void shutdownHandlers?.();
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
    title: CODER_NAME,
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
