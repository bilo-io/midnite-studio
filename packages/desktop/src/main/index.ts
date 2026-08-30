import { dirname, join } from 'node:path';

import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { BrowserWindow, app } from 'electron';

import { createActivityDetector } from './activity-detect';
import { createAgentWatcher, realAgentWatcherDeps } from './agent-watcher';
import { destroyAllBrowserTabs } from './browser-service';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { registerClaudeHandlers } from './ipc/claude-handlers';
import { configureDiagnostics, registerDiagHandlers } from './ipc/diag-handlers';
import { registerForgeHandlers } from './ipc/forge-handlers';
import { registerFsHandlers } from './ipc/fs-handlers';
import { registerFsSearchHandlers } from './ipc/fs-search-handlers';
import { registerFsWriteHandlers } from './ipc/fs-write-handlers';
import { bindMetricsToWindow, registerMetricsHandlers } from './ipc/metrics-handlers';
import { registerPtyHandlers } from './ipc/pty-handlers';
import { registerTerminalHandlers } from './ipc/terminal-handlers';
import { registerRefHandlers } from './ipc/ref-handlers';
import { registerRebaseHandlers } from './ipc/rebase-handlers';
import { registerClipboardHandlers } from './ipc/clipboard-handlers';
import { registerRemoteHandlers } from './ipc/remote-handlers';
import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerSearchHandlers } from './ipc/search-handlers';
import { registerStatsHandlers } from './ipc/stats-handlers';
import { registerStatusHandlers } from './ipc/status-handlers';
import { configureTests, registerTestsHandlers } from './ipc/tests-handlers';
import { defaultLogger, type Logger } from './log';
import { installMenu } from './menu';
import {
  detachAll,
  initPtyService,
  notifyActivityDisabled,
  setActivityDetector,
  setAgentWatcher,
  tickActivityClocks,
} from './pty-service';
import { createTerminalStore } from './terminal-store';
import {
  configureTerminals,
  listAgents,
  shutdownTerminals,
  startTerminalFlush,
} from './terminal-service';
import { configureRegistry, listRepos, openRepo, restoreRepos } from './repo-registry';
import { reconcileWatchers, stopAllWatchers } from './watch-service';
import { createTrustStore } from './diagnostics/trust-store';
import { createTestTrustStore } from './testing/trust-store';
import { createRepoStore } from './repo-store';
import { LEGACY_APP_NAME, migrateLegacyRepoStore } from './userdata-migration';
import { installMgitFileProtocol, registerMgitFileScheme } from './fs-protocol';
import { ensureLoginShellPath } from './shell-path';
import { createWindow } from './window';
import { registerWindowChrome } from './window-chrome';

/**
 * Electron main entry point.
 *
 * Owns everything the renderer cannot: git (through @midnite/studio-git-engine),
 * node-pty, the filesystem, and the native window. The renderer reaches all of
 * it through the typed bridge in ../preload.
 */

let mainWindow: BrowserWindow | null = null;
const getWindow = (): BrowserWindow | null => mainWindow;

/**
 * Open repositories named by `MSTUDIO_OPEN_REPOS` (a colon-separated path list).
 *
 * Dev/verification seam: the only other way into a populated sidebar is the
 * native folder dialog, which a screenshot or smoke run can't drive. Paths go
 * through the same `openRepo` as the dialog, so this exercises the real code
 * path rather than a fixture.
 */
async function openReposFromEnv(): Promise<void> {
  const list = process.env['MSTUDIO_OPEN_REPOS'];
  if (!list) return;
  for (const path of list.split(':').filter((p) => p.length > 0)) {
    await openRepo(path);
  }
}

/**
 * A crashed or killed renderer heals through the same path as a menu reload.
 *
 * Nothing observed renderer lifecycle before this (Phase 30 Theme B) — a
 * crash left a blank window with every pty still alive in main, which is
 * exactly the bug this phase overturns for a reload and quit alike. The
 * `webContents` survives the reload, so the closure-captured `win` that
 * `createPty` sends events through keeps working with no further wiring; the
 * renderer's own `hydrate()` rebinds to the still-live ptys once it comes
 * back up.
 *
 * `did-finish-load` is deliberately NOT subscribed anywhere: nothing needed
 * re-arming after an ordinary reload, since the `webContents` object itself
 * never changed.
 */
function bindRenderProcessGone(win: BrowserWindow, log: Logger): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`[renderer] gone reason=${details.reason} exit=${details.exitCode}`);
    if (details.reason === 'clean-exit') return;
    if (win.isDestroyed()) return;
    win.webContents.reload();
  });
}

/**
 * A second instance would open a second window onto the same repositories, with
 * two watchers and two write queues racing on the same `index.lock`. Hand the
 * launch to the running instance instead.
 */
/**
 * Electron derives the app name from package.json, which here is the scoped
 * workspace name — so the macOS menu bar, the About dialog and `~/Library/
 * Application Support` all read "@midnite/studio-desktop". Set it before anything
 * reads it, which includes `app.getPath('userData')`.
 *
 * This is the display name, matching electron-builder's `productName`. It has a
 * space in it, which means `userData` moved when the app was renamed from
 * `midnite-git` — see ./userdata-migration.
 */
app.setName('Midnite Git');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Before anything spawns a subprocess: a Finder launch inherits launchd's
  // bare PATH, which has no Homebrew git, no credential helpers and no user
  // shell config. Must run before the first git or pty call.
  ensureLoginShellPath();

  // Chromium fixes the privileged-scheme list at startup — must precede ready.
  registerMgitFileScheme();

  void app.whenReady().then(async () => {
    registerWindowChrome(getWindow);
    registerRepoHandlers(getWindow);
    registerSearchHandlers(getWindow);
    registerStatusHandlers();
    registerStatsHandlers();
    registerRebaseHandlers();
    registerRefHandlers();
    registerRemoteHandlers();
    registerClipboardHandlers();
    registerForgeHandlers();
    registerDiagHandlers();
    registerTestsHandlers(getWindow);
    registerPtyHandlers(getWindow);
    registerBrowserHandlers(getWindow);
    /*
      What is running inside each terminal, from the pty's own process tree.

      Wired here rather than inside `pty-service` because the roster it matches
      against lives behind `terminal-service`, which already imports
      `pty-service` for the scrollback — injecting the watcher is what keeps
      that a line rather than a cycle. `listAgents` is passed as a thunk, not
      called: the agents store is configured further down, after `whenReady`.
    */
    setAgentWatcher(
      createAgentWatcher(
        realAgentWatcherDeps(
          listAgents,
          (event) => {
            const win = getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(EVENT_CHANNELS.ptyAgentChanged, event);
            }
          },
          (event) => {
            const win = getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(EVENT_CHANNELS.ptyCommandChanged, event);
            }
          },
        ),
      ),
    );
    const metrics = registerMetricsHandlers(getWindow);
    registerTerminalHandlers();
    registerFsHandlers();
    registerFsWriteHandlers();
    registerFsSearchHandlers();
    registerClaudeHandlers(getWindow);
    installMgitFileProtocol();
    installMenu(getWindow);

    // Restore before the window opens: the renderer's first `repo:list` fires
    // on mount, and an empty answer there shows the empty state for a frame
    // even though repos are about to appear.
    const userData = app.getPath('userData');
    // Must run before the store is read: the rename to "Midnite Git" moved
    // userData, and the user's repository list is still under the old name.
    await migrateLegacyRepoStore(join(dirname(userData), LEGACY_APP_NAME), userData);
    await initPtyService({
      userDataDir: userData,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      getWindow,
      log: (msg) => defaultLogger(msg),
    });
    configureRegistry(createRepoStore(userData));
    configureTerminals(createTerminalStore(userData), userData);
    /*
      One compile of the roster's activity markers for the life of the
      process — `agents.json` "reloads on next launch" already (Settings ▸
      Terminal's own hint), so compiling once here costs nothing a relaunch
      would not already have paid. The shared 1s tick drives every tracked
      pty's decay clock rather than a timer each.
    */
    setActivityDetector(
      createActivityDetector(await listAgents(), {
        now: Date.now,
        log: defaultLogger,
        onDisabled: notifyActivityDisabled,
      }),
    );
    setInterval(tickActivityClocks, 1000).unref();
    configureDiagnostics(createTrustStore(userData));
    configureTests(createTestTrustStore(userData));
    await restoreRepos();
    await openReposFromEnv();

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    // Sampling follows visibility: blurred, hidden or minimized stops it
    // outright rather than spending an `ioreg` spawn every few seconds on a
    // footer nobody can see.
    bindMetricsToWindow(metrics, mainWindow);
    bindRenderProcessGone(mainWindow, defaultLogger);

    // Periodic scrollback flush, so a crash or a force-quit still leaves
    // something to restore rather than only the last clean exit.
    startTerminalFlush();

    // Watch what was restored. After this the handlers reconcile on every
    // open/close, so there is exactly one place that starts a watcher at boot.
    await reconcileWatchers(
      mainWindow,
      (await listRepos()).map((repo) => ({ id: repo.id, path: repo.path })),
    );

    // macOS: clicking the dock icon with no windows open reopens one.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        mainWindow.on('closed', () => {
          mainWindow = null;
        });
        // The reopened window is a new BrowserWindow, so it carries none of
        // the visibility listeners the first one was given. Without this the
        // sampler never pauses again for the rest of the session.
        bindMetricsToWindow(metrics, mainWindow);
        bindRenderProcessGone(mainWindow, defaultLogger);
      }
    });
  });

  /**
   * Flush the terminal state, then let the quit proceed.
   *
   * `before-quit` is synchronous, so writing the sessions and their scrollback
   * needs the standard two-pass dance: cancel the first quit, do the async work,
   * then quit again for real. Without it the app exits mid-write and the restore
   * on next launch is whatever the last 15-second interval happened to catch.
   */
  let flushed = false;
  app.on('before-quit', (event) => {
    stopAllWatchers();
    destroyAllBrowserTabs();

    if (flushed) {
      detachAll();
      return;
    }

    event.preventDefault();
    void shutdownTerminals().finally(() => {
      flushed = true;
      // Detach from broker without killing background sessions
      detachAll();
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    detachAll();
    stopAllWatchers();
    destroyAllBrowserTabs();
    // macOS apps conventionally stay alive with no windows; everywhere else,
    // closing the last window quits.
    if (process.platform !== 'darwin') app.quit();
  });
}
