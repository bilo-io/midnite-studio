import { access } from 'node:fs/promises';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  shell,
  utilityProcess,
  clipboard,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

import type { CaptureWorkerHandle } from '@midnite/studio-feature-media-map/main';
import type { TerrainWorkerHandle } from '@midnite/studio-feature-media-terrain/main';
import { guardAppWindow, createFileSink, installCrashLogging, type LogSink } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME, MSTUDIO_GAME_SCHEME, MSTUDIO_TILE_SCHEME, type FfmpegStatus } from '@midnite/studio-shared';

import { createGamerAgentHost, type GamerAgentHost, gamerMediaRoot, type GamerServices } from '@midnite/studio-module-gamer/main';
import { asGameWindow, createGamerGameElectron, gamePageContents } from './game-electron';
import { GAMER_NAME, SMOKE_READY_LINE, USER_DATA_ENV, gamerUserData, gamerVaultDirectory, isSmoke } from './identity';
import { installGamerHostFileProtocol, registerGamerHost } from './host';
import { reportMenuTemplate } from './report';
import { gamerPairing } from './pairing';
import { bindMetricsToWindow, registerSuiteMain, suiteRuntimeDirectory, suiteWindowOptions, type SuiteMain } from '@midnite/studio-runtime';
import { registerSuiteMonitor, type MetricsService } from '@midnite/studio-feature-monitor/main';

/**
 * Midnite Gamer's main process — the entry the bundle's `package.json` names (`main.cjs`), run by the
 * launcher's stub as `Resources/app`. One window over media-core with the Games, Maps, Terrain and Sprites
 * tabs, registered through a `FeatureMainContext` built from the runtime; no desktop, no other app. Media
 * lives under Gamer's own userData (`Midnite Runtime/apps/gamer/media/`), never in Studio's repositories.
 * Gamer composes no vault: its three stored keys come from the runtime host's, paired and granted
 * (`pairing.ts`, `keys.ts`), and a key that is not granted reads as unset.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
/** Monitor's sampler (the status bar's segment), paused while the window is not in view. */
let metrics: MetricsService | null = null;
let crashLog: LogSink | null = null;
let services: (GamerServices & { shutdown: () => void }) | null = null;
let agentHost: GamerAgentHost | null = null;

app.setName(GAMER_NAME);
if (smoke) app.dock?.hide();
const override = process.env[USER_DATA_ENV];
app.setPath('userData', gamerUserData(app.getPath('appData'), override));
// All three schemes in ONE call before `ready`: Electron keeps only the last list.
protocol.registerSchemesAsPrivileged([
  { scheme: MSTUDIO_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } },
  { scheme: MSTUDIO_GAME_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: MSTUDIO_TILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

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

async function pickTiledMap(): Promise<string | null> {
  const options = { title: 'Import a Tiled map', properties: ['openFile' as const], filters: [{ name: 'Tiled map', extensions: ['tmj', 'json'] }] };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
}

/** Where the bundle carries what the games need: beside `main.cjs` when packaged, in the tree in dev. */
const bundled = (name: string, dev: string[]): string => {
  const beside = join(__dirname, name);
  return app.isPackaged ? beside : join(__dirname, ...dev);
};

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // A launcher link (`--midnite-link=…`) tells the running host which module and view to land on.
    suite?.handleArgv(argv);
    if (win === null) return;
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
      openExternal: (url) => shell.openExternal(url),
      onMetricsService: (service) => {
        metrics = service;
      },
    });
    // The runtime's crash-log sink (NDJSON, rotated, redacted) — what Report an Issue reads.
    crashLog = createFileSink({ dir: app.getPath('userData'), name: 'gamer.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog?.write(level, message));
    crashLog.write('info', `${GAMER_NAME} ${app.getVersion()} started`);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        reportMenuTemplate((channel, payload) => {
          const target = BrowserWindow.getFocusedWindow() ?? win;
          if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload);
        }) as MenuItemConstructorOptions[],
      ),
    );
    const userData = app.getPath('userData');
    const mediaRoot = gamerMediaRoot(userData);
    // Terrain's PBR tiles ship beside the bundle; the feature finds them through this override.
    process.env['MSTUDIO_TERRAIN_MATERIALS_DIR'] ??= join(__dirname, 'terrain-materials');
    installGamerHostFileProtocol({ handle: (scheme, handler) => protocol.handle(scheme, handler), fetchFile: (u) => net.fetch(u) }, mediaRoot);
    // Nothing starts here: a run creates its own server under mcp-runs/ and the shim beside main.cjs runs
    // under this binary as plain node. A smoke run composes none, so it starts no server and no agent.
    agentHost = smoke
      ? null
      : createGamerAgentHost({ runsDir: join(userData, 'mcp-runs'), shimScript: join(__dirname, 'game-mcp-shim.cjs'), execPath: process.execPath });
    services = registerGamerHost({
      ...(agentHost ? { gameAgentHost: agentHost } : {}),
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      mediaRoot,
      userData,
      // The runtime host's vault, over its socket: Gamer never reaches the keychain itself, and a smoke run
      // (no keychain, no pairing file) keeps even the socket path inside its own directory.
      vaultDirectory: gamerVaultDirectory(app.getPath('appData'), override),
      pairing: gamerPairing(userData, smoke),
      hasWindow: () => win !== null && !win.isDestroyed(),
      // A smoke run never reads or writes the user's real ~/Midnite Games.
      ...(smoke ? { defaultGamesRoot: join(userData, 'games') } : {}),
      revealPath: (target) => shell.showItemInFolder(target),
      pickSavePath,
      pickTiledMap,
      ffmpegStatus,
      fetch: (url, init) => net.fetch(url, init),
      userAgent: `MidniteGamer/${app.getVersion()} (+https://github.com/bilo-io/midnite-apps)`,
      // JPEG and WebP: `nativeImage` yields BGRA, which the capture worker's DEM decode wants as RGBA.
      nativeDecode: async (bytes) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        if (image.isEmpty()) return null;
        const { width, height } = image.getSize();
        const bgra = image.toBitmap();
        const rgba = new Uint8Array(bgra.length);
        for (let i = 0; i < bgra.length; i += 4) {
          rgba[i] = bgra[i + 2]!;
          rgba[i + 1] = bgra[i + 1]!;
          rgba[i + 2] = bgra[i]!;
          rgba[i + 3] = bgra[i + 3]!;
        }
        return { width, height, rgba };
      },
      toPng: async (bytes, { maxSide }) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        if (image.isEmpty()) return null;
        const { width, height } = image.getSize();
        const side = Math.max(width, height);
        if (side <= maxSide) return { png: image.toPNG() };
        const scale = maxSide / side;
        const resized = image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' });
        return { png: resized.toPNG(), downscaledFrom: { width, height } };
      },
      // The workers are forked lazily and killed on quit (`before-quit` below).
      spawnCaptureWorker: () =>
        utilityProcess.fork(join(__dirname, 'map-capture-worker.js'), [], { serviceName: 'gamer-map-capture', stdio: 'ignore' }) as CaptureWorkerHandle,
      spawnTerrainWorker: () =>
        utilityProcess.fork(join(__dirname, 'terrain-worker.js'), [], { serviceName: 'gamer-terrain', stdio: 'ignore' }) as TerrainWorkerHandle,
      game: {
        electron: createGamerGameElectron(),
        contents: gamePageContents,
        getWindow: asGameWindow(() => win),
        templateDir: bundled('templates/media-game', ['..', '..', '..', 'templates', 'media-game']),
        enginesDir: process.env['MSTUDIO_GAME_ENGINES_DIR'] ?? bundled('game-engines', ['..', '..', '..', 'packages', 'desktop', 'resources', 'game-engines']),
      },
      log: (line) => {
        // eslint-disable-next-line no-console
        if (!smoke) console.log(line);
      },
      // The Creator module (Phase 124 Theme E.3): Report an Issue's services, printing and Audio's import.
      creator: {
        report: {
          sink: () => crashLog,
          homeDir: () => app.getPath('home'),
          bootLine: () => `${GAMER_NAME} ${app.getVersion()}`,
          openExternal: (url) => shell.openExternal(url),
          writeClipboard: (text) => clipboard.writeText(text),
          revealPath: (path) => shell.showItemInFolder(path),
        },
        videoTemplateRoot: join(__dirname, 'templates', 'media-video'),
        openPath: (target) => shell.openPath(target),
        pickImportFiles,
        printToPdf,
      },
    });
    // `mstudio-tile:` answers on the default session through the one tile fetcher.
    services.map.installProtocol((scheme, handler) => protocol.handle(scheme, (request) => handler(request)));
    openWindow();
  });

  app.on('before-quit', () => {
    // Every game agent run: its CLI's whole process group killed, its private server closed and removed.
    services?.gameAgents?.cancelAll();
    agentHost?.dispose();
    services?.media.stopWatchers();
    // Creator's video renders (Phase 124 Theme E.3).
    services?.shutdown();
    // Every running game's view and process, the capture worker and the terrain build worker.
    services?.games.stopAll();
    services?.map.dispose();
    services?.terrain.dispose();
    services?.close();
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
    title: GAMER_NAME,
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
