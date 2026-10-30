import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  WebContentsView,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  denyAllPermissions,
  type BrowserElectron,
  type BrowserHostWindow,
  type BrowserViewOptions,
} from '@midnite/studio-feature-browser/main';
import {
  assertSiteIsolation,
  buildSuiteMenuTemplate,
  createFileSink,
  devToolsAllowed,
  guardAppWindow,
  installCrashLogging,
} from '@midnite/studio-runtime';
import { reportIssueMenuItem } from '@midnite/studio-feature-report/main';

import { registerBrowserAppHandlers } from '@midnite/studio-module-browser/main';
import { BROWSER_NAME, browserUserData, isSmoke, SMOKE_READY_LINE, USER_DATA_ENV } from './identity';
import { registerSuiteMain, suiteRuntimeDirectory, type SuiteMain } from '@midnite/studio-runtime';

/**
 * Midnite Browser's main process — the entry the bundle's `package.json` names (`main.cjs`), run by the
 * launcher's stub as `Resources/app`. One window over the browser feature: full-window tabs and the web
 * apps, on the same services, security posture and partitions Studio's browser pane uses (`context.ts`).
 * Browser holds no credential and reads no vault.
 */
const smoke = isSmoke(process.env);
let win: BrowserWindow | null = null;
/** The shell's two bridge halves (suite prefs, window chrome), registered once the app is ready. */
let suite: SuiteMain | null = null;
let shutdownHandlers: (() => void) | null = null;

app.setName(BROWSER_NAME);
// A smoke run is a proof, not a session: keep it out of the Dock and off the screen.
if (smoke) app.dock?.hide();
app.setPath('userData', browserUserData(app.getPath('appData'), process.env[USER_DATA_ENV]));

/**
 * The real Electron behind the feature's structural port. Electron's classes are wider and overloaded,
 * so they are cast once, here (Studio's `desktop/src/main/browser-port.ts` does the same). Every object
 * passed is the real one, so the services' window-identity checks hold.
 */
const browserElectron = {
  createView: (options: BrowserViewOptions) => new WebContentsView(options as ConstructorParameters<typeof WebContentsView>[0]),
  sessionFromPartition: (partition: string) => session.fromPartition(partition),
  onDisplayMetricsChanged: (listener: () => void) => {
    screen.on('display-metrics-changed', listener);
  },
  openExternal: (url: string) => shell.openExternal(url),
  // Phase 117 Theme G: the ClickFix watch reads the system clipboard from main, and its bar clears it.
  readClipboardText: () => clipboard.readText(),
  clearClipboard: () => clipboard.clear(),
} as unknown as BrowserElectron;

const asHost = (w: BrowserWindow | null): BrowserHostWindow | null => (w ? (w as unknown as BrowserHostWindow) : null);

// eslint-disable-next-line no-console
const log = Object.assign((message: string) => console.log(`[browser] ${message}`), {
  // eslint-disable-next-line no-console
  warn: (message: string) => console.warn(`[browser] ${message}`),
  // eslint-disable-next-line no-console
  error: (message: string, err?: unknown) => console.error(`[browser] ${message}`, err ?? ''),
});

// A smoke run is one-shot and must not collide with a real Browser's lock.
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
    // Crash log + Report an Issue: the runtime's file sink, the app's own Help menu item, and the report feature's services.
    const crashLog = createFileSink({ dir: app.getPath('userData'), name: 'browser.log', homeDir: app.getPath('home') });
    installCrashLogging((level, message) => crashLog.write(level, message));
    crashLog.write('info', `${BROWSER_NAME} ${app.getVersion()} started`);
    app.on('will-quit', () => crashLog.close());
    // Phase 117 Theme A: site isolation, the sandbox and web security stay on — a boot that finds
    // `--no-sandbox` or its kin throws in dev and logs when packaged (the runtime's `chromium-switches.ts`).
    // Checked at ready, not at module top level: `app.commandLine` is final once ready fires (a switch
    // appended later changes nothing), so nothing can slip in behind the check; the crash log exists by
    // now, so a packaged boot that fails it is on disk and not on a stderr no Finder launch has; and a
    // dev throw exits the process — Electron's default handler would show a dialog and keep it alive.
    try {
      assertSiteIsolation({
        argv: process.argv,
        hasSwitch: (name) => app.commandLine.hasSwitch(name),
        getSwitchValue: (name) => app.commandLine.getSwitchValue(name),
        isPackaged: app.isPackaged,
        log: {
          error: (message: string) => {
            log.error(message);
            crashLog.write('error', message);
          },
        },
      });
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      app.exit(1);
      return;
    }
    const reportServices = {
      sink: () => crashLog,
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
    // App, Edit and Help only. Electron's default View/Window menus would put Close Window on Mod+w and
    // Reload on Mod+r, so those chords would close or reload Browser itself instead of reaching the tab
    // commands the renderer binds them to (`use-browser-keys.ts`).
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildSuiteMenuTemplate({
          reportItem: reportIssueMenuItem(sendToFocused),
          omit: { view: true, window: true },
        }) as MenuItemConstructorOptions[],
      ),
    );
    // The app window's own session asks for nothing — no camera, microphone, notifications or the
    // rest. Studio replaces Electron's allow-everything default the same way (`allowAppAudioOnly`, for
    // its companion's microphone); Browser's renderer has no use for any, so it denies them all. The
    // pages a tab shows are on `persist:browser`, which the feature denies separately.
    denyAllPermissions(session.defaultSession);
    const registered = registerBrowserAppHandlers({
      ipcMain,
      report: reportServices,
      trashItem: (path) => shell.trashItem(path),
      send: (channel, payload) => {
        if (win !== null && !win.isDestroyed()) win.webContents.send(channel, payload);
      },
      electron: browserElectron,
      // Phase 117 Theme A: a tab's DevTools open in dev or behind MSTUDIO_DEVTOOLS=1, never otherwise.
      devToolsAllowed: devToolsAllowed(app.isPackaged),
      getMainWindow: () => asHost(win),
      senderWindow: (event) => {
        const sender = (event as { sender?: Electron.WebContents }).sender;
        return sender ? asHost(BrowserWindow.fromWebContents(sender)) : null;
      },
      writeClipboard: (text) => clipboard.writeText(text),
      log,
      userDataPath: app.getPath('userData'),
    });
    shutdownHandlers = registered.shutdown;
    openWindow();
  });

  app.on('before-quit', () => {
    shutdownHandlers?.();
  });

  app.on('window-all-closed', () => {
    shutdownHandlers?.();
    app.quit();
  });
  app.on('activate', () => {
    if (win === null) openWindow();
  });
}

function openWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: BROWSER_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  suite?.attachWindow(win);
  // The app window never browses (it carries the bridge): a link in Browser's own chrome goes to the
  // system browser. Pages are browsed in the tabs' own sandboxed views, never in this window.
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
