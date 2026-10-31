import { mkdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
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
import {
  buildSuiteMenuTemplate,
  createFileSink,
  guardAppWindow,
  importRetiredAppData,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';

import type { FfmpegStatus } from '@midnite/studio-shared';

import { registerAgentsHost } from './host';
import { AGENTS_NAME, SMOKE_READY_LINE, USER_DATA_ENV, isSmoke, agentsUserData, agentsVaultDirectory } from './identity';
import { agentsPairing } from './pairing';
import { bindMetricsToWindow, registerSuiteMain, suiteRuntimeDirectory, suiteWindowOptions, type SuiteMain } from '@midnite/studio-runtime';
import { registerSuiteMonitor, type MetricsService } from '@midnite/studio-feature-monitor/main';

/**
 * Midnite Agents's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the chats, councils, workflows and models features and the
 * MCP Tools view; the Ollama
 * cloud key is read here from the runtime vault, as `agents`, and never leaves this process.
 */
const smoke = isSmoke(process.env);

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
async function ffmpegStatus(): Promise<FfmpegStatus> {
  for (const path of FFMPEG_CANDIDATES) {
    try {
      await access(path);
      return { found: true, path, version: null };
    } catch {
      // try the next
    }
  }
  return { found: false, reason: 'ffmpeg was not found. Install it with Homebrew to enable exports.' };
}

/** A hidden, script-less window prints a doc's standalone HTML (Creator's Docs export). */
async function printToPdf(htmlFile: string): Promise<Buffer> {
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await printer.loadFile(htmlFile);
    return await printer.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    printer.destroy();
  }
}

const override = process.env[USER_DATA_ENV];
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
/** Monitor's sampler (the status bar's segment), paused while the window is not in view. */
let metrics: MetricsService | null = null;

app.setName(AGENTS_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', agentsUserData(app.getPath('appData'), override));

// A smoke run is one-shot and must not collide with a real Agents' lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Phase 124 Theme G.4: take over what the apps merged into this one left behind, once (never in a throwaway run).
  // After the lock: a launcher link's `open -n` instance quits at the lock and must not run it beside the live host.
  if (override === undefined || override === '') importRetiredAppData({ appData: app.getPath('appData'), host: 'agents' });
  app.on('second-instance', (_event, argv) => {
    // A launcher link (`--midnite-link=…`) tells the running host which module and view to land on.
    suite?.handleArgv(argv);
    if (win === null) {
      // Window closed but the app still running (macOS): a link brings it back, as the Dock icon does.
      if (suite !== null) openWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    suite = registerSuiteMain({
      ipcMain,
      runtimeDirectory: suiteRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV]),
      getWindow: () => win,
      argv: process.argv,
      warn: (message) => process.stderr.write(`${message}\n`),
    });
    // The prefs file watcher is a live handle: let go of it with the app.
    app.on('will-quit', () => suite?.close());
    // The status bar's monitor segment (Phase 123 Theme H): the sampler, system health and token spend.
    registerSuiteMonitor({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      homeDir: app.getPath('home'),
      warn: (message) => process.stderr.write(`${message}\n`),
      onMetricsService: (service) => {
        metrics = service;
      },
    });
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
    const handlers = registerAgentsHost({
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
      // The Coder module (Phase 124 Theme E.3): its repository picker, windows, native dialogs and script worker.
      coder: {
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
        // The sandboxed `pm.*` script runner is its own OS process, built beside this bundle and killed on quit.
        scriptWorker: () =>
          utilityProcess.fork(join(__dirname, 'script-runner-worker.cjs'), [], {
            serviceName: 'midnite-agents-script-runner',
            stdio: 'ignore',
          }) as unknown as ScriptWorkerHandle,
        // eslint-disable-next-line no-console
        warn: (message) => console.warn(`[agents] ${message}`),
      },
      // The Creator module: media under `<userData>/media`, its dialogs, printing and ffmpeg.
      creator: {
        videoTemplateRoot: join(__dirname, 'templates', 'media-video'),
        openPath: (target) => shell.openPath(target),
        revealPath: (target) => shell.showItemInFolder(target),
        pickSavePath: async (options) => {
          const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
          return picked.canceled || !picked.filePath ? null : picked.filePath;
        },
        pickImportFiles: async (options) => {
          const dialogOptions = { ...options, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'> };
          const picked = win ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
          return picked.canceled ? null : picked.filePaths;
        },
        printToPdf,
        ffmpegStatus,
      },
    });
    // A council member's or script node's shell is its own process group, so it would outlive Agents unless
    // killed here, and an in-flight workflow run must be cancelled so its node's process group dies with it
    // (as are Coder's collection runs and script worker and Creator's video renders, mounted in the same host).
    // Quit is held once while that finishes (a few ms; the run's own cancel poll is bounded), then finished
    // with `app.exit` — a second `app.quit()` after a prevented `will-quit` is ignored by Electron.
    let disposed = false;
    app.on('will-quit', (event) => {
      if (disposed) return;
      event.preventDefault();
      disposed = true;
      void handlers.shutdown().finally(() => app.exit(0));
    });
    openWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (win === null) openWindow();
  });
}

function openWindow(): void {
  // Frameless where the platform allows (Phase 123 Theme A): the shell's title bar is the drag region.
  const { additionalArguments, ...frame } = suiteWindowOptions(process.platform);
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    title: AGENTS_NAME,
    show: false,
    ...frame,
    webPreferences: {
      additionalArguments,
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  suite?.attachWindow(win);
  if (metrics !== null) bindMetricsToWindow(win, metrics);
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
