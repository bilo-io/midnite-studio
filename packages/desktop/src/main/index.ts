import { dirname, join } from 'node:path';

import { BrowserWindow, app } from 'electron';

import { registerPtyHandlers } from './ipc/pty-handlers';
import { registerTerminalHandlers } from './ipc/terminal-handlers';
import { registerRefHandlers } from './ipc/ref-handlers';
import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerStatusHandlers } from './ipc/status-handlers';
import { installMenu } from './menu';
import { killAllPtys } from './pty-service';
import { createTerminalStore } from './terminal-store';
import {
  configureTerminals,
  shutdownTerminals,
  startTerminalFlush,
} from './terminal-service';
import { configureRegistry, listRepos, openRepo, restoreRepos } from './repo-registry';
import { reconcileWatchers, stopAllWatchers } from './watch-service';
import { createRepoStore } from './repo-store';
import { LEGACY_APP_NAME, migrateLegacyRepoStore } from './userdata-migration';
import { ensureLoginShellPath } from './shell-path';
import { createWindow } from './window';
import { registerWindowChrome } from './window-chrome';

/**
 * Electron main entry point.
 *
 * Owns everything the renderer cannot: git (through @midnite/git-engine),
 * node-pty, the filesystem, and the native window. The renderer reaches all of
 * it through the typed bridge in ../preload.
 */

let mainWindow: BrowserWindow | null = null;
const getWindow = (): BrowserWindow | null => mainWindow;

/**
 * Open repositories named by `MGIT_OPEN_REPOS` (a colon-separated path list).
 *
 * Dev/verification seam: the only other way into a populated sidebar is the
 * native folder dialog, which a screenshot or smoke run can't drive. Paths go
 * through the same `openRepo` as the dialog, so this exercises the real code
 * path rather than a fixture.
 */
async function openReposFromEnv(): Promise<void> {
  const list = process.env['MGIT_OPEN_REPOS'];
  if (!list) return;
  for (const path of list.split(':').filter((p) => p.length > 0)) {
    await openRepo(path);
  }
}

/**
 * A second instance would open a second window onto the same repositories, with
 * two watchers and two write queues racing on the same `index.lock`. Hand the
 * launch to the running instance instead.
 */
/**
 * Electron derives the app name from package.json, which here is the scoped
 * workspace name — so the macOS menu bar, the About dialog and `~/Library/
 * Application Support` all read "@midnite/git-desktop". Set it before anything
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

  void app.whenReady().then(async () => {
    registerWindowChrome(getWindow);
    registerRepoHandlers(getWindow);
    registerStatusHandlers();
    registerRefHandlers();
    registerPtyHandlers(getWindow);
    registerTerminalHandlers();
    installMenu(getWindow);

    // Restore before the window opens: the renderer's first `repo:list` fires
    // on mount, and an empty answer there shows the empty state for a frame
    // even though repos are about to appear.
    const userData = app.getPath('userData');
    // Must run before the store is read: the rename to "Midnite Git" moved
    // userData, and the user's repository list is still under the old name.
    await migrateLegacyRepoStore(join(dirname(userData), LEGACY_APP_NAME), userData);
    configureRegistry(createRepoStore(userData));
    configureTerminals(createTerminalStore(userData), userData);
    await restoreRepos();
    await openReposFromEnv();

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

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

    if (flushed) {
      killAllPtys();
      return;
    }

    event.preventDefault();
    void shutdownTerminals().finally(() => {
      flushed = true;
      // Ptys are children, not detached processes: without this a shell is
      // orphaned per window per launch, and on macOS those outlive the app.
      killAllPtys();
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    killAllPtys();
    stopAllWatchers();
    // macOS apps conventionally stay alive with no windows; everywhere else,
    // closing the last window quits.
    if (process.platform !== 'darwin') app.quit();
  });
}
