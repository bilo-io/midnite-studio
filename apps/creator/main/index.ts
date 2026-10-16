import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron';

import type { MediaService } from '@midnite/studio-feature-media-core/main';
import { createVaultGrants, createVaultService, guardAppWindow, runtimeDataDirectory } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME, type FfmpegStatus } from '@midnite/studio-shared';

import { creatorMediaRoot, registerCreatorHandlers } from './context';
import { installCreatorFileProtocol } from './file-protocol';
import { CREATOR_NAME, SMOKE_READY_LINE, USER_DATA_ENV, creatorUserData, isSmoke } from './identity';

/**
 * Midnite Creator's main process — the entry the bundle's `package.json` names (`main.cjs`), run
 * by the launcher's stub as `Resources/app`. One window over media-core with the Docs and Images
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
    const mediaRoot = creatorMediaRoot(app.getPath('userData'));
    // A smoke run never touches the keychain or the shared runtime directory.
    // Denied until the user grants Creator access in Vault — the grants file decides, never the
    // runtime's allow-all default.
    const vaultDirectory = runtimeDataDirectory(app.getPath('appData'));
    const vault = smoke
      ? null
      : createVaultService({
          directory: vaultDirectory,
          cipher: safeStorage,
          authorize: createVaultGrants({ directory: vaultDirectory }).authorize,
        }).forApp('creator');
    installCreatorFileProtocol({ handle: (scheme, handler) => protocol.handle(scheme, handler), fetchFile: (u) => net.fetch(u) }, mediaRoot);
    media = registerCreatorHandlers({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      mediaRoot,
      revealPath: (target) => shell.showItemInFolder(target),
      pickSavePath,
      printToPdf,
      ffmpegStatus,
      readKey: async (key) => (vault ? vault.get('secrets', key) : null),
    });
    openWindow();
  });

  app.on('before-quit', () => media?.stopWatchers());
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
