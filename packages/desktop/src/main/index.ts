import { BrowserWindow, app } from 'electron';

import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerStatusHandlers } from './ipc/status-handlers';
import { installMenu } from './menu';
import { configureRegistry, openRepo, restoreRepos } from './repo-registry';
import { createRepoStore } from './repo-store';
import { ensureLoginShellPath } from './shell-path';
import { createWindow } from './window';
import { registerWindowChrome } from './window-chrome';

/**
 * Electron main entry point.
 *
 * Owns everything the renderer cannot: git (through @midnite-git/git-engine),
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
    installMenu(getWindow);

    // Restore before the window opens: the renderer's first `repo:list` fires
    // on mount, and an empty answer there shows the empty state for a frame
    // even though repos are about to appear.
    configureRegistry(createRepoStore(app.getPath('userData')));
    await restoreRepos();
    await openReposFromEnv();

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

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

  app.on('window-all-closed', () => {
    // macOS apps conventionally stay alive with no windows; everywhere else,
    // closing the last window quits.
    if (process.platform !== 'darwin') app.quit();
  });
}
