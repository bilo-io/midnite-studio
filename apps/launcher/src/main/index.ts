import { join, resolve } from 'node:path';

import { createLinkRateLimiter } from '@midnite/studio-shared/page-deep-link';
import { app, BrowserWindow, Menu, shell } from 'electron';

import { LAUNCHER_CHANNELS } from '../common/bridge';
import type { AppId } from '../common/catalog';
import { lockstepBundleFinder } from './bundles/open';
import { productionBundleRoots } from './bundles/layout';
import { createAppsOps } from './bundles/apps-ops';
import { installAppBundle, uninstallAppBundle } from './bundles/install-bundle';
import { readInstalledState } from './bundles/state';
import { identityForApp, productionBundleDeps } from './bundles/production';
import { updateInstalledBundles } from './bundles/updates';
import { fetchCatalog } from './feed';
import { applyDevIdentity, pinDataDir } from './identity';
import { registerIpc, takePendingApp } from './ipc';
import { handleMidniteLink, linkFromArgv } from './router';
import { findStudio } from './studio';
import { isAdHocSigned, loadAutoUpdater, runLauncherUpdates } from './updater';

/**
 * Midnite Apps — main process.
 *
 * One window, a sandboxed renderer, a preload that exposes `window.midniteLauncher`,
 * and nothing else: no native modules, no background services, no pty. The
 * launcher's whole job is to say what is installed, install it, and open it.
 */

let mainWindow: BrowserWindow | null = null;

/**
 * Per-app bundles under userData, their Dock stubs in /Applications (`bundles/layout.ts`).
 * Resolved on use, after `pinDataDir` has pinned userData.
 */
const bundleRoots = () => productionBundleRoots(app.getPath('userData'));

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    title: 'Midnite Apps',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d14',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--launcher-version=${app.getVersion()}`],
    },
  });

  // The renderer is a local page; anything that tries to leave it goes to the
  // system browser instead (only http(s) — never `file:` or a custom scheme).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

/**
 * `midnite://open?app=…` (Phase 113 Theme D). Registered for dev (so the link finds this
 * checkout's Electron) and packaged runs; the scheme is also declared in electron-builder.yml
 * so a packaged build's Info.plist claims it.
 */
function registerProtocol(): void {
  if (!app.isPackaged) {
    const mainScript = process.argv[1] ? resolve(process.argv[1]) : process.cwd();
    app.setAsDefaultProtocolClient('midnite', process.execPath, [mainScript]);
  } else {
    app.setAsDefaultProtocolClient('midnite');
  }
}

let pendingLink: string | null = null;
let ready = false;

function bringForward(): void {
  if (mainWindow === null) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Phase 117 Theme G: at most one `midnite://open?run=…` per 10 s reaches Studio's run confirm. */
const runLimiter = createLinkRateLimiter();

function openLink(raw: string): void {
  if (!ready) {
    pendingLink = raw;
    return;
  }
  void handleMidniteLink(
    raw,
    {
      findAppBundle: lockstepBundleFinder(bundleRoots().installRoot, app.getVersion()),
      isStudioInstalled: async () => (await findStudio()) !== null,
      runLimiter,
    },
    {
      openBundle: (path) => shell.openPath(path).then((error) => (error === '' ? undefined : Promise.reject(new Error(error)))),
      openStudioUrl: (url) => shell.openExternal(url),
      showDetail: (id: AppId) => {
        bringForward();
        const send = () => mainWindow?.webContents.send(LAUNCHER_CHANNELS.appShow, id);
        // A window still loading has no listener yet: park it for the renderer to take on mount.
        if (mainWindow === null || mainWindow.webContents.isLoading()) takePendingApp(id);
        else send();
      },
    },
  );
}

/**
 * The suite's one updater: the launcher itself on its `generic` feed, then every installed app
 * bundle from `catalog.json` (`updater.ts`, `bundles/updates.ts`). Packaged builds only.
 */
async function startUpdates(): Promise<void> {
  const deps = productionBundleDeps(bundleRoots(), {
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    version: app.getVersion(),
  });
  if (!app.isPackaged) return;
  await runLauncherUpdates({
    updater: await loadAutoUpdater(),
    isPackaged: app.isPackaged,
    adHocSigned: app.isPackaged && isAdHocSigned(process.execPath),
    updateBundles: async () => {
      if (deps !== null) await updateInstalledBundles(await fetchCatalog(), identityForApp, deps);
    },
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  openLink(url);
});

// Before the lock, which Electron keys on userData — and before anything reads that path.
pinDataDir(app);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerProtocol();
  app.on('second-instance', (_event, argv) => {
    const link = linkFromArgv(argv);
    if (link !== undefined) openLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Dev runs the stock Electron binary — give it the launcher's own name and Dock icon.
  applyDevIdentity(app, __dirname);

  void app.whenReady().then(() => {
    // The default menu minus the developer items a launcher has no use for.
    if (app.isPackaged) {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
          { role: 'windowMenu' },
        ]),
      );
    }
    registerIpc(() => mainWindow, {
      ops: createAppsOps({
        runtimeVersion: app.getVersion(),
        fetchCatalog: () => fetchCatalog(),
        readState: () => readInstalledState(bundleRoots().installRoot),
        identityFor: identityForApp,
        bundleDeps: () =>
          productionBundleDeps(bundleRoots(), { isPackaged: app.isPackaged, execPath: process.execPath, version: app.getVersion() }),
        install: installAppBundle,
        // To the Trash, never rm: removing an app from a launcher should be undoable from Finder.
        uninstall: (identity, deps) => uninstallAppBundle(identity, { ...deps, remove: (path) => shell.trashItem(path) }),
        onProgress: (event) => mainWindow?.webContents.send(LAUNCHER_CHANNELS.appProgress, event),
      }),
      findBundle: (id) => lockstepBundleFinder(bundleRoots().installRoot, app.getVersion())(id),
    });
    createWindow();
    ready = true;
    const first = pendingLink ?? linkFromArgv(process.argv);
    pendingLink = null;
    if (first !== undefined && first !== null) openLink(first);
    void startUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
