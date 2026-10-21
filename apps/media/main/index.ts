import { existsSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';

import { libraryFileResolver } from '@midnite/studio-feature-media-library/main';
import { connectRuntimeVault, guardAppWindow, vaultHostSocketPath } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { mediaLibraryDataDir, registerMediaHandlers } from './context';
import { installMediaFileProtocol } from './file-protocol';
import {
  MEDIA_NAME,
  SMOKE_READY_LINE,
  USER_DATA_ENV,
  isSmoke,
  mediaUserData,
  mediaVaultDirectory,
} from './identity';
import { createMediaKeyReader } from './keys';
import { mediaPairing } from './pairing';

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
    const { library, lan } = registerMediaHandlers({
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
    });
    // Stopped with the app (remembering it was on); started at launch only when the user left it on and
    // chose "start with the app" — and never in a smoke run.
    app.on('will-quit', () => void lan.dispose());
    if (!smoke) void lan.startAtLaunch();
    installMediaFileProtocol(
      {
        handle: (scheme, handler) => protocol.handle(scheme, handler),
        fetchFile: (fileUrl, headers) => net.fetch(fileUrl, { headers, bypassCustomProtocolHandlers: true }),
      },
      libraryFileResolver(library),
    );
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
    height: 820,
    minWidth: 900,
    minHeight: 560,
    title: MEDIA_NAME,
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
