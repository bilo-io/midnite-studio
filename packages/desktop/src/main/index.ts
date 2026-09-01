import { resolve, dirname, join } from 'node:path';

import { EVENT_CHANNELS, CHANNELS } from '@midnite/studio-shared';
import { BrowserWindow, app, ipcMain } from 'electron';
import { parseDeepLink } from './protocol-parse';
import { registerCliHandlers } from './ipc/cli-handlers';
import { registerUpdater } from './update-service';
import { readSystemHealth } from './system-health';


import { createActivityDetector } from './activity-detect';
import { createAgentWatcher, realAgentWatcherDeps } from './agent-watcher';
import { destroyAllBrowserTabs } from './browser-service';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { registerClaudeHandlers } from './ipc/claude-handlers';
import { registerCouncilHandlers } from './ipc/council-handlers';
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
  onSessionExit,
  setActivityDetector,
  setAgentWatcher,
} from './pty-service';
import { registerLoopRunsHandlers } from './ipc/loop-runs-handlers';
import { configureLoopRuns, noteSessionExit } from './loop-runs';
import { createLoopRunsStore } from './loop-runs-store';
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
import { configureCouncils } from './council-service';
import { createCouncilsRunsStore } from './councils-runs-store';
import { createCouncilsStore } from './councils-store';
import { migrateAnyLegacyRepoStore } from './userdata-migration';
import { installMgitFileProtocol, registerMgitFileScheme } from './fs-protocol';
import { registerPerfHandlers } from './ipc/perf-handlers';
import { bootMark } from './perf-marks';
import { ensureLoginShellPathAsync } from './shell-path';
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
 * This is the display name, matching electron-builder's `productName`. It has
 * moved twice — `midnite-git`, then `Midnite Git` — and `userData` moved with
 * it each time, which is what ./userdata-migration carries across.
 */
/*
  The first line of this module's body, and therefore the first moment every
  static import above has been evaluated — ESM hoists them, so this is where the
  import graph's cost has already been paid. Theme B's one number for "how
  expensive is main's module graph"; it needs no `app` and must stay first.
*/
bootMark('modules-loaded');

app.setName('Midnite Studio');

if (!app.isPackaged) {
  const mainScript = process.argv[1] ? resolve(process.argv[1]) : process.cwd();
  app.setAsDefaultProtocolClient('midnite-studio', process.execPath, [mainScript]);
} else {
  app.setAsDefaultProtocolClient('midnite-studio');
}

let pendingDeepLink: string | null = null;

async function handleDeepLinkUrl(rawUrl: string): Promise<void> {
  const parsed = parseDeepLink(rawUrl);
  if (!parsed) return;

  const win = getWindow();
  if (!win || win.isDestroyed()) {
    pendingDeepLink = rawUrl;
    return;
  }

  let known = false;
  if (parsed.kind === 'open') {
    const allRepos = await listRepos();
    known = allRepos.some((r) => r.path === parsed.repo);
  }

  win.webContents.send(EVENT_CHANNELS.deepLink, { link: parsed, known });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  /*
    Kicked off here, deliberately un-awaited: a Finder launch inherits launchd's
    bare PATH, which has no Homebrew git, no credential helpers and no user shell
    config, and asking the login shell costs a median 284 ms (Theme A's baseline).
    Awaiting it — as this did until Theme B — spent all of that ahead of
    `app.whenReady()`, blocking the main thread while Chromium was starting up
    anyway. Now the probe overlaps that startup and only its *consumers* wait:
    `initPtyService` (every pty inherits this PATH) and `restoreRepos` (the first
    git exec, which may shell out to a credential helper).

    INSIDE the single-instance branch, and that placement is load-bearing. A
    second instance's whole job is to hand its argv to the running one and quit —
    and that is not a rare path, it is how every `midnite-studio://` deep link
    arrives. Spawning it above the lock check, as an earlier draft of this did,
    means every deep link fires a `zsh -lic` that nothing will ever read.
  */
  const loginShellReady = ensureLoginShellPathAsync().then(() => {
    bootMark('login-shell-done');
  });

  app.on('second-instance', (_event, argv) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLinkArg = argv.find((arg) => arg.startsWith('midnite-studio://'));
    if (deepLinkArg) {
      handleDeepLinkUrl(deepLinkArg);
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    handleDeepLinkUrl(url);
  });

  // Chromium fixes the privileged-scheme list at startup — must precede ready.
  registerMgitFileScheme();

  void app.whenReady().then(async () => {
    bootMark('when-ready');
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
    registerCliHandlers();
    registerCouncilHandlers();
    registerLoopRunsHandlers();
    registerUpdater(getWindow);
    ipcMain.handle(CHANNELS.systemHealth, () => readSystemHealth());
    registerPerfHandlers();
    installMgitFileProtocol();
    installMenu(getWindow);
    bootMark('handlers-registered');

    // Restore before the window opens: the renderer's first `repo:list` fires
    // on mount, and an empty answer there shows the empty state for a frame
    // even though repos are about to appear.
    const userData = app.getPath('userData');
    // Must run before the store is read: each rename ("Midnite Studio", then
    // "Midnite Studio") moved userData, and the user's repository list is
    // still under whichever name they last launched.
    await migrateAnyLegacyRepoStore((name) => join(dirname(userData), name), userData);
    bootMark('legacy-migrated');

    /*
      Store wiring is synchronous assignment of module state from `userData` and
      nothing else, so it is hoisted above the parallel block rather than
      threaded through it: `restoreRepos` needs the repo store and `listAgents`
      needs the agents store, and both now start at the same moment.
    */
    configureRegistry(createRepoStore(userData));
    configureTerminals(createTerminalStore(userData), userData);
    configureCouncils(createCouncilsStore(userData), createCouncilsRunsStore(userData));
    configureDiagnostics(createTrustStore(userData));
    configureTests(createTestTrustStore(userData));

    /*
      Three independent boot chains, run at once (Theme B). They were sequential
      for no reason beyond the order they were written in: the pty service, the
      agent roster and the repository list touch different stores and different
      subsystems. What is NOT independent is stated as code rather than as a
      comment — the migration above must precede all three (it may move the very
      stores they read), and `createWindow` must follow all three.
    */
    /*
      Every pty inherits this process's PATH, so the probe has to have landed
      before the service comes up. This is the wait Theme B moved off the
      pre-`whenReady` path and onto the consumer that actually needs it — the
      probe still costs something, but it is now overlapped with Chromium's
      startup and with the two chains beside this one instead of preceding
      everything.
    */
    const ptyChain = loginShellReady
      .then(() =>
        initPtyService({
          userDataDir: userData,
          appVersion: app.getVersion(),
          isPackaged: app.isPackaged,
          getWindow,
          log: (msg) => defaultLogger(msg),
        }),
      )
      .then(() => {
        bootMark('pty-ready');
        /*
          The loop ledger's ends are owned here in main: a run's record is
          finalised off the pty's own session-keyed exit, so a renderer reload
          mid-run cannot lose it. Wired after `initPtyService` — the hook
          registry is module state, but the exits it observes only exist once the
          service is up.
        */
        configureLoopRuns(createLoopRunsStore(userData), getWindow);
        onSessionExit(noteSessionExit);
      });

    /*
      One compile of the roster's activity markers for the life of the
      process — `agents.json` "reloads on next launch" already (Settings ▸
      Terminal's own hint), so compiling once here costs nothing a relaunch
      would not already have paid. The shared 1s tick drives every tracked
      pty's decay clock rather than a timer each.
    */
    const activityChain = listAgents().then((rosterForActivity) => {
      bootMark('agents-listed');
      setActivityDetector(
        createActivityDetector(rosterForActivity, {
          now: Date.now,
          log: defaultLogger,
          onDisabled: notifyActivityDisabled,
        }),
      );
    });

    /*
      `restoreRepos` is the first git exec of the session and may shell out to a
      credential helper, so it is the other consumer that waits on the login-shell
      PATH. `openReposFromEnv` stays sequenced behind it — same store.
    */
    const reposChain = loginShellReady
      .then(() => restoreRepos())
      .then(() => openReposFromEnv())
      .then(() => {
        bootMark('repos-restored');
      });

    /*
      `allSettled`, not `all`, and the difference matters more than it did when
      these were sequential awaits.

      `Promise.all` rejects on the first failure and abandons the rest — so a
      corrupt `agents.json` breaking `listAgents()` would leave `initPtyService`
      and `restoreRepos` to finish against a `getWindow()` that returns null
      forever, because `createWindow()` below never runs. A live main process with
      a broker, ptys and watchers, and no window: nothing to see, nothing to
      close, and an unhandled rejection as the only trace.

      A window is the one thing boot must produce. Each chain's failure is logged
      and survivable on its own — no roster means no activity marks, no repo
      store means an empty sidebar the user can open a repo into — so every one of
      them is reported and boot continues.
    */
    const settled = await Promise.allSettled([ptyChain, activityChain, reposChain]);
    const chainNames = ['pty-service', 'agent-roster', 'repo-restore'] as const;
    settled.forEach((outcome, index) => {
      if (outcome.status === 'rejected') {
        defaultLogger(
          `[boot] ${chainNames[index]} failed: ${
            outcome.reason instanceof Error ? outcome.reason.stack ?? outcome.reason.message : String(outcome.reason)
          }`,
        );
      }
    });

    mainWindow = createWindow();
    bootMark('create-window');
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    // Sampling follows visibility: blurred, hidden or minimized stops it
    // outright rather than spending an `ioreg` spawn every few seconds on a
    // footer nobody can see.
    bindMetricsToWindow(metrics, mainWindow);
    bindRenderProcessGone(mainWindow, defaultLogger);

    if (pendingDeepLink) {
      handleDeepLinkUrl(pendingDeepLink);
      pendingDeepLink = null;
    }

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
