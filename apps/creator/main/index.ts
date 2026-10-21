import { access } from 'node:fs/promises';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';

import type { MediaService } from '@midnite/studio-feature-media-core/main';
import { effectiveVideoRoot, stopAllVideoProcesses } from '@midnite/studio-feature-media-video/main';
import {
  buildSuiteMenuTemplate,
  connectRuntimeVault,
  createFileSink,
  guardAppWindow,
  installCrashLogging,
  runtimeDataDirectory,
  vaultHostSocketPath,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';
import { MSTUDIO_FILE_SCHEME, type FfmpegStatus } from '@midnite/studio-shared';

import { creatorMediaRoot, registerCreatorHandlers } from './context';
import { installCreatorFileProtocol } from './file-protocol';
import { CREATOR_NAME, SMOKE_READY_LINE, USER_DATA_ENV, creatorUserData, isSmoke } from './identity';
import { creatorPairing } from './pairing';

/**
 * Midnite Creator's main process — the entry the bundle's `package.json` names (`main.cjs`), run
 * by the launcher's stub as `Resources/app`. One window over media-core with the Docs, Images, Video and Audio
 * tabs, registered through a `FeatureMainContext` built from the runtime; no desktop, no other
 * app. Media lives under Creator's own userData (`Midnite Runtime/apps/creator/media/`), never in
 * Studio's repositories. Image provider keys are read here, from the runtime vault, as `creator`.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let media: MediaService | null = null;

app.setName(CREATOR_NAME);
if (smoke) app.dock?.hide();
const override = process.env[USER_DATA_ENV];
app.setPath('userData', creatorUserData(app.getPath('appData'), override));
// The gallery's `mstudio-file://` URLs, before `ready` as Electron requires.
protocol.registerSchemesAsPrivileged([{ scheme: MSTUDIO_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } }]);

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

async function pickSavePath(options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) {
  const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return picked.canceled || !picked.filePath ? null : picked.filePath;
}

async function pickImportFiles(options: { title: string; filters: { name: string; extensions: string[] }[] }) {
  const dialogOptions = { ...options, properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'> };
  const picked = win ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  return picked.canceled ? null : picked.filePaths;
}

/** A hidden, script-less window prints a doc's standalone HTML. */
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
    const log = createFileSink({ dir: app.getPath('userData'), name: 'creator.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    log.write('info', `${CREATOR_NAME} ${app.getVersion()} started`);
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
    const mediaRoot = creatorMediaRoot(app.getPath('userData'));
    // The runtime host's vault (Studio), over its socket: Creator never touches the keychain, and the
    // host's grants deny it until the user grants Creator access in Vault. A smoke run reaches no host.
    const runtimeDirectory = override ? join(override, 'runtime') : runtimeDataDirectory(app.getPath('appData'));
    const vault = smoke
      ? null
      : connectRuntimeVault({
          socketPath: vaultHostSocketPath(runtimeDirectory),
          appId: 'creator',
          identity: creatorPairing(app.getPath('userData'), smoke),
        });
    installCreatorFileProtocol(
      { handle: (scheme, handler) => protocol.handle(scheme, handler), fetchFile: (u) => net.fetch(u) },
      mediaRoot,
      effectiveVideoRoot,
    );
    media = registerCreatorHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      mediaRoot,
      videoSettingsDir: app.getPath('userData'),
      videoTemplateRoot: join(__dirname, 'templates', 'media-video'),
      openPath: (target) => shell.openPath(target),
      revealPath: (target) => shell.showItemInFolder(target),
      pickSavePath,
      pickImportFiles,
      printToPdf,
      ffmpegStatus,
      readKey: async (key) => (vault ? vault.get('secrets', key) : null),
    });
    openWindow();
  });

  app.on('before-quit', () => {
    media?.stopWatchers();
    stopAllVideoProcesses();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (win === null) openWindow();
  });
}

function openWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    title: CREATOR_NAME,
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
