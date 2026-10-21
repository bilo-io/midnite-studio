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

import {
  createDisplayMediaGate,
  electronCapturePort,
  electronOverlayOpener,
  type CaptureElectronModules,
  type CaptureOverlayBrowserWindow,
  type CaptureService,
} from '@midnite/studio-feature-capture/main';
import {
  buildSuiteMenuTemplate,
  createFileSink,
  guardAppWindow,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';
import { CAPTURE_OVERLAY_ARG, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { captureDataDir, registerCaptureAppHandlers } from './context';
import { installCaptureFileProtocol } from './file-protocol';
import {
  CAPTURE_NAME,
  captureUserData,
  isSmoke,
  SMOKE_READY_LINE,
  USER_DATA_ENV,
} from './identity';
import {
  installCapturePermissions,
  isCaptureAppOrigin,
  type CapturePermissionSession,
} from './permissions';

/**
 * Midnite Capture's main process — the entry the bundle's `package.json` names (`main.cjs`), run by the
 * launcher's stub as `Resources/app`. One window over the capture feature: stills, regions, recordings,
 * the opt-in clipboard history and the one global chord. Capture holds no credential, reads no vault,
 * opens no listening socket and makes no network call: everything it takes stays under its own userData
 * (`Midnite Runtime/apps/capture/capture/`) until the user copies or reveals it.
 *
 * A smoke run (`MIDNITE_CAPTURE_SMOKE=1`) takes no chord and never reads the clipboard — it only proves
 * the window loads, prints the ready line and quits.
 *
 * Slice 2: Region opens the desktop overlay ({@link openOverlayWindow}) over the display under the
 * pointer, and Send to ▸ Midnite Studio opens a `midnite-studio://capture?id=` link main builds from the
 * stored capture's id — the system hands it to Studio, which asks before it imports. No network either way.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
let capture: CaptureService | null = null;

app.setName(CAPTURE_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', captureUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));
// Captures are shown as `mstudio-file://capture/…` URLs, registered before `ready` as Electron requires.
// `stream` lets a recording's player seek.
protocol.registerSchemesAsPrivileged([
  { scheme: MSTUDIO_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } },
]);

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

// A smoke run is one-shot and must not collide with a real Capture's lock.
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusWindow());

  void app.whenReady().then(() => {
    // Crash log + Report an Issue: the runtime's file sink, the app's own Help menu item, and the report feature's services.
    const log = createFileSink({ dir: app.getPath('userData'), name: 'capture.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => log.write(level, message));
    log.write('info', `${CAPTURE_NAME} ${app.getVersion()} started`);
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
    // App, Edit and Help only (Quit, Hide; copy and paste).
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildSuiteMenuTemplate({
          reportItem: reportIssueMenuItem(sendToFocused),
          omit: { view: true, window: true },
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
    capture = registerCaptureAppHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
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
    });
    installCaptureFileProtocol(
      {
        handle: (scheme, handler) => protocol.handle(scheme, handler),
        fetchFile: (fileUrl, headers) =>
          net.fetch(fileUrl, { headers, bypassCustomProtocolHandlers: true }),
      },
      capture.fileResolver,
    );
    void capture.start();
    openWindow();
  });

  // The chord is released and clipboard polling stops with the app — never left behind.
  app.on('will-quit', () => {
    const current = capture;
    capture = null;
    if (current) void current.dispose();
    globalShortcut.unregisterAll();
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

/**
 * The desktop region overlay's window: frameless, transparent, always on top over one display, with the
 * overlay's own preload (three calls) and the same navigation guard as the app window — no
 * `window.open`, no navigating off its page, and no hand-off (it has no link to follow).
 */
function openOverlayWindow(options: Record<string, unknown>): CaptureOverlayBrowserWindow {
  const overlay = new BrowserWindow(options as ConstructorParameters<typeof BrowserWindow>[0]);
  guardAppWindow(overlay.webContents, { openExternal: () => undefined });
  return overlay;
}

function openWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: CAPTURE_NAME,
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
