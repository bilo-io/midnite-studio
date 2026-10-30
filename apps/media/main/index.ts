import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

import { libraryFileResolver } from '@midnite/studio-feature-media-library/main';
import { connectRuntimeVault, guardAppWindow, vaultHostSocketPath, createFileSink, installCrashLogging, type LogSink } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME, type FfmpegStatus } from '@midnite/studio-shared';

import { createMediaKeyReader, mediaLibraryDataDir } from '@midnite/studio-module-media/main';
import {
  MEDIA_NAME,
  SMOKE_READY_LINE,
  USER_DATA_ENV,
  isSmoke,
  mediaUserData,
  mediaVaultDirectory,
} from './identity';
import { installMediaHostFileProtocol, registerMediaHost } from './host';
import { reportMenuTemplate } from './report';
import { mediaPairing } from './pairing';
import { registerSuiteMain, suiteRuntimeDirectory, suiteWindowOptions, type SuiteMain } from '@midnite/studio-runtime';

/**
 * Midnite Media's main process — the entry the bundle's `package.json` names (`main.cjs`), run by the
 * launcher's stub as `Resources/app`. One window over the media shell with the Library tab, registered
 * through a `FeatureMainContext` built from the runtime; no desktop, no other app. The library's index
 * and art cache live under Media's own userData (`Midnite Runtime/apps/media/media-library/`); the
 * folders it reads are only ever the ones the user picked. It opens a listening socket only when the user
 * starts Share on your network (bound to the private address they picked — `createLanStreamServer`), and
 * makes no internet call unless the user switches online metadata on — and then only to TMDB, with the key
 * read here from the runtime vault, as `media`, paired and granted.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
let crashLog: LogSink | null = null;

app.setName(MEDIA_NAME);
if (smoke) app.dock?.hide();
const override = process.env[USER_DATA_ENV];
app.setPath('userData', mediaUserData(app.getPath('appData'), override));
// The Library's `mstudio-file://library/…` URLs, before `ready` as Electron requires. `stream` lets a
// player's Range requests through.
protocol.registerSchemesAsPrivileged([
  { scheme: MSTUDIO_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } },
]);

async function pickDirectory(): Promise<string | null> {
  const options = {
    title: 'Add a folder to the library',
    properties: ['openDirectory'] as Array<'openDirectory'>,
  };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
}

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
/** Creator's export tools look for ffmpeg here (the Library's own chooser is separate). */
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

async function chooseFfmpeg(): Promise<string | null> {
  const options = {
    title: 'Choose ffmpeg',
    properties: ['openFile'] as Array<'openFile'>,
    ...(existsSync('/opt/homebrew/bin') ? { defaultPath: '/opt/homebrew/bin' } : {}),
  };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : (picked.filePaths[0] ?? null);
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
    suite = registerSuiteMain({
      ipcMain,
      runtimeDirectory: suiteRuntimeDirectory(app.getPath('appData'), process.env[USER_DATA_ENV]),
      getWindow: () => win,
      warn: (message) => process.stderr.write(`${message}\n`),
    });
    // The prefs file watcher is a live handle: let go of it with the app.
    app.on('will-quit', () => suite?.close());
    // The runtime's crash-log sink (NDJSON, rotated, redacted) — what Report an Issue reads.
    crashLog = createFileSink({ dir: app.getPath('userData'), name: 'media.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog?.write(level, message));
    crashLog.write('info', `${MEDIA_NAME} ${app.getVersion()} started`);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        reportMenuTemplate((channel, payload) => {
          const target = BrowserWindow.getFocusedWindow() ?? win;
          if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload);
        }) as MenuItemConstructorOptions[],
      ),
    );
    const userData = app.getPath('userData');
    // The runtime host's vault (Studio), over its socket: Media never touches the keychain, and the
    // host's grants deny it until the user grants Media access in Vault. A smoke run reaches no host.
    const vault = smoke
      ? null
      : connectRuntimeVault({
          socketPath: vaultHostSocketPath(mediaVaultDirectory(app.getPath('appData'), override)),
          appId: 'media',
          identity: mediaPairing(userData, smoke),
        });
    const readKey = vault ? createMediaKeyReader(vault) : async () => null;
    const registered = registerMediaHost({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      dataDir: mediaLibraryDataDir(userData),
      pickDirectory,
      readKey: () => readKey('media.tmdbApiKey'),
      // Only ever called once the user has switched online metadata on and a granted key reads back.
      fetch: (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init),
      homeDir: homedir(),
      // Share on your network: the private addresses it may bind, and where a system ffmpeg might be.
      interfaces: networkInterfaces,
      pathEnv: process.env.PATH ?? '',
      chooseFfmpeg,
      // The Creator module (Phase 124 Theme E.3): Report an Issue's services, the media dialogs, printing and ffmpeg.
      creator: {
        report: {
          sink: () => crashLog,
          homeDir: () => app.getPath('home'),
          bootLine: () => `${MEDIA_NAME} ${app.getVersion()}`,
          openExternal: (url) => shell.openExternal(url),
          writeClipboard: (text) => clipboard.writeText(text),
          revealPath: (path) => shell.showItemInFolder(path),
        },
        userData,
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
        // Image-provider keys, read here from the runtime vault as `media` — never sent to the renderer.
        readKey: async (key) => (vault ? vault.get('secrets', key) : null),
      },
    });
    const { library, lan } = registered;
    // Stopped with the app (remembering it was on); started at launch only when the user left it on and
    // chose "start with the app" — and never in a smoke run.
    app.on('will-quit', () => {
      void lan.dispose();
      registered.shutdown();
    });
    if (!smoke) void lan.startAtLaunch();
    installMediaHostFileProtocol(
      {
        handle: (scheme, handler) => protocol.handle(scheme, handler),
        fetchFile: (fileUrl, headers) => net.fetch(fileUrl, { headers, bypassCustomProtocolHandlers: true }),
      },
      libraryFileResolver(library),
      userData,
    );
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
    height: 820,
    minWidth: 900,
    minHeight: 560,
    title: MEDIA_NAME,
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
