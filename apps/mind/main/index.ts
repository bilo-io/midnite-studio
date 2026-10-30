import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  systemPreferences,
  type MenuItemConstructorOptions,
} from 'electron';

import { guardAppWindow, createFileSink, importRetiredAppData, installCrashLogging, type LogSink } from '@midnite/studio-runtime';

import {
  createDisplayMediaGate,
  electronCapturePort,
  electronOverlayOpener,
  type CaptureElectronModules,
  type CaptureOverlayBrowserWindow,
  type CaptureService,
} from '@midnite/studio-feature-capture/main';
import {
  captureDataDir,
  installCaptureFileProtocol,
  installCapturePermissions,
  isCaptureAppOrigin,
  type CapturePermissionSession,
} from '@midnite/studio-module-capture/main';
import { CAPTURE_OVERLAY_ARG, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { registerMindHost } from './host';
import { MIND_NAME, SMOKE_READY_LINE, USER_DATA_ENV, mindUserData, isSmoke } from './identity';
import { registerReport, reportMenuTemplate } from './report';
import { registerSuiteMain, suiteRuntimeDirectory, suiteWindowOptions, type SuiteMain } from '@midnite/studio-runtime';

/**
 * Midnite Mind's main process — the entry the bundle's `package.json` names (`main.cjs`), run by
 * the launcher's stub as `Resources/app`. One window over the Mind module, plus the Capture module it mounts
 * (Phase 124 Theme E.3), registered through `registerMindHost`; no desktop, no other app. Notes are stored under
 * Mind's own userData (`Midnite Runtime/apps/mind/notes/`), never Studio's, and captures under its `capture/`.
 * Capture takes no chord by default here and reads no clipboard until the user turns either on; a smoke run
 * takes neither.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
let crashLog: LogSink | null = null;
let quit: (() => Promise<void>) | null = null;
let capture: CaptureService | null = null;
let flushed = false;

app.setName(MIND_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
// Captures are shown as `mstudio-file://capture/…` URLs, registered before `ready` as Electron requires.
// `stream` lets a recording's player seek.
protocol.registerSchemesAsPrivileged([{ scheme: MSTUDIO_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } }]);
app.setPath('userData', mindUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));
// Phase 124 Theme G.4: take over what the apps merged into this one left behind, once (never in a throwaway run).
if (process.env[USER_DATA_ENV] === undefined || process.env[USER_DATA_ENV] === '') importRetiredAppData({ appData: app.getPath('appData'), host: 'mind' });

// A smoke run is one-shot and must not collide with a real Mind's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusWindow());

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
    crashLog = createFileSink({ dir: app.getPath('userData'), name: 'mind.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog?.write(level, message));
    crashLog.write('info', `${MIND_NAME} ${app.getVersion()} started`);
    const sendToWindow = (channel: string, payload: unknown): void => {
      if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    registerReport(
      { ipcMain, trashItem: (path) => shell.trashItem(path), send: sendToWindow },
      {
        sink: () => crashLog,
        homeDir: () => app.getPath('home'),
        bootLine: () => `${MIND_NAME} ${app.getVersion()}`,
        openExternal: (url) => shell.openExternal(url),
        writeClipboard: (text) => clipboard.writeText(text),
        revealPath: (path) => shell.showItemInFolder(path),
      },
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        reportMenuTemplate((channel, payload) => {
          const target = BrowserWindow.getFocusedWindow() ?? win;
          if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload);
        }) as MenuItemConstructorOptions[],
      ),
    );
    const gate = createDisplayMediaGate({ isAppOrigin: isCaptureAppOrigin });
    installCapturePermissions(session.defaultSession as unknown as CapturePermissionSession, gate);
    const electron = electronCapturePort(
      {
        platform: process.platform,
        desktopCapturer,
        systemPreferences,
        screen,
        globalShortcut,
        clipboard,
        nativeImage,
        shell,
      } as unknown as CaptureElectronModules,
      { windows: () => BrowserWindow.getAllWindows(), focusApp: focusWindow },
    );
    const host = registerMindHost({
      ipcMain,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      notesDirectory: app.getPath('userData'),
      knowledgeCacheDirectory: join(app.getPath('userData'), 'knowledge-cache'),
      // eslint-disable-next-line no-console
      warn: (issue) => console.warn(`[mind] ${issue}`),
      capture: {
        dataDir: captureDataDir(app.getPath('userData')),
        electron,
        gate,
        background: !smoke,
        overlay: electronOverlayOpener({
          createWindow: openOverlayWindow,
          htmlPath: join(__dirname, 'capture-overlay.html'),
          preloadPath: join(__dirname, 'overlay-preload.cjs'),
          tokenArg: CAPTURE_OVERLAY_ARG,
        }),
        // Only ever a `midnite-studio://capture` link: main builds it, the renderer never passes a URL.
        openStudioLink: (url) => shell.openExternal(url),
      },
    });
    capture = host.capture;
    quit = host.shutdown;
    // Mind has no other `mstudio-file://` resolver, so the scheme's one handler is Capture's.
    installCaptureFileProtocol(
      {
        handle: (scheme, handler) => protocol.handle(scheme, handler),
        fetchFile: (fileUrl, headers) => net.fetch(fileUrl, { headers, bypassCustomProtocolHandlers: true }),
      },
      host.capture.fileResolver,
    );
    void host.capture.start();
    openWindow();
  });

  // Writes are debounced and Capture holds a chord: hold the quit until the notes are on disk and the chord is released.
  app.on('before-quit', (event) => {
    if (flushed || quit === null) return;
    event.preventDefault();
    flushed = true;
    void quit().finally(() => {
      globalShortcut.unregisterAll();
      app.quit();
    });
  });
  // Capture keeps running with its window closed only while a chord is registered to bring it back.
  app.on('window-all-closed', () => {
    if (smoke || capture === null) {
      app.quit();
      return;
    }
    void capture.status().then((status) => {
      if (status.shortcut.state !== 'registered') app.quit();
    });
  });
  app.on('activate', () => {
    if (win === null) openWindow();
  });
}

function focusWindow(): void {
  if (win === null || win.isDestroyed()) {
    openWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  app.focus({ steal: true });
  win.focus();
}

/**
 * The desktop region overlay's window: frameless, transparent, always on top over one display, with the
 * overlay's own preload (three calls) and the same navigation guard as the app window.
 */
function openOverlayWindow(options: Record<string, unknown>): CaptureOverlayBrowserWindow {
  const overlay = new BrowserWindow(options as ConstructorParameters<typeof BrowserWindow>[0]);
  guardAppWindow(overlay.webContents, { openExternal: () => undefined });
  return overlay;
}

function openWindow(): void {
  // Frameless where the platform allows (Phase 123 Theme A): the shell's title bar is the drag region.
  const { additionalArguments, ...frame } = suiteWindowOptions(process.platform);
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: MIND_NAME,
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
