import { unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

import { totalmem } from 'node:os';

import { getGlobalGitIdentity, setGlobalGitIdentity } from '@midnite/studio-git-engine';
import {
  createPairingStore,
  createVaultGrants,
  createVaultService,
  runtimeHostDirectory,
  type VaultHost,
} from '@midnite/studio-runtime';
import {
  EVENT_CHANNELS,
  CHANNELS,
  GitIdentitySetRequest,
  failure,
  perfEnabled,
  SetupProbeRequest,
  SetupRevealRequest,
} from '@midnite/studio-shared';
import { BrowserWindow, app, safeStorage, session, shell, type WebContentsView } from 'electron';
import { parseDeepLink } from './protocol-parse';
import { registerCliHandlers } from './ipc/cli-handlers';
import { registerUpdater } from './update-service';
import { registerReleaseNotesHandlers } from './ipc/release-notes-handlers';

import { createActivityDetector } from './activity-detect';
import { createAgentWatcher, realAgentWatcherDeps } from './agent-watcher';
import { allowAppAudioOnly, denyAllDevices, destroyAllBrowserTabs, destroyAllWebApps, startBrowserDiscardSweep, startWebAppsDiscardSweep } from '@midnite/studio-feature-browser/main';
import { installCsp } from './csp';
import { registerBrowserFeatureHandlers } from './ipc/browser-feature-handlers';
import { registerClaudeHandlers } from './ipc/claude-handlers';
import { registerConflictHandlers } from './ipc/conflict-handlers';
import { registerCouncilHandlers } from './ipc/council-handlers';
import { registerApiClientFeatureHandlers, shutdownApiClientFeature } from './ipc/api-client-feature-handlers';
import { registerFinanceHandlers } from './ipc/finance-handlers';
import { configureSecrets, configureVaultGrants, registerSecretsHandlers } from './ipc/secrets-handlers';
import { createSecretsVault } from './secrets-vault';
import {
  configureForgeAccounts,
  configureGitlabLanguageCache,
  createForgeAccountsStore,
  createForgeAccountVault,
  createGitlabLanguageCacheStore,
  FORGE_POLL_MS,
} from '@midnite/studio-feature-forge/main';
import { registerDatabaseFeatureHandlers, shutdownDatabaseFeature } from './ipc/database-feature-handlers';
import { configureKnowledge, registerKnowledgeHandlers } from './ipc/knowledge-handlers';
import { configureDiagnostics, registerDiagHandlers } from './ipc/diag-handlers';
import { createCompanionStore } from './companion/companion-store';
import { configureCompanion } from './companion/digest';
import { configureLocalStt, configureStt } from './companion/stt';
import { configureCompanionTtsBroker, disposeCompanionTtsBroker } from './companion/tts-broker';
import { createSttCredentials } from './companion/stt/credentials';
import { configureUiBridge } from './companion/ui-bridge';
import { registerCompanionHandlers } from './ipc/companion-handlers';
import { configureSessions, registerSessionsHandlers } from './ipc/sessions-handlers';
import { configureChats, disposeChats, registerChatsHandlers } from './ipc/chats-handlers';
import { configureNotes, registerNotesHandlers } from './ipc/notes-handlers';
import { createSessionHistoryStore } from './session-history-store';
import { createNotesStore } from '@midnite/studio-feature-notes/main';
import { registerScaffoldHandlers } from './ipc/scaffold-handlers';
import { handle, handleBare } from './ipc/handle';
import { probeSetupItems } from './setup-probe';
import { createStudioForgePoller, registerForgeFeatureHandlers } from './ipc/forge-feature-handlers';
import { registerAiHandlers } from './ipc/ai-handlers';
import { registerFsHandlers } from './ipc/fs-handlers';
import { registerFsSearchHandlers } from './ipc/fs-search-handlers';
import { registerFsWriteHandlers } from './ipc/fs-write-handlers';
import { bindMetricsToWindow, registerMetricsHandlers } from './ipc/metrics-handlers';
import { registerOptimizerHandlers } from './ipc/optimizer-handlers';
import { registerPtyHandlers } from './ipc/pty-handlers';
import { bindAgentProbeToWindow, startAgentProbeAtBoot } from './agent-probe-runtime';
import { registerTerminalHandlers } from './ipc/terminal-handlers';
import { registerTrashHandlers } from './ipc/trash-handlers';
import { registerRefHandlers } from './ipc/ref-handlers';
import { registerRebaseHandlers } from './ipc/rebase-handlers';
import { registerClipboardHandlers } from './ipc/clipboard-handlers';
import { registerRepoLogoHandlers } from './ipc/repo-logo-handlers';
import { registerRemoteHandlers } from './ipc/remote-handlers';
import { registerHooksHandlers } from './ipc/hooks-handlers';
import { registerRepoHandlers } from './ipc/repo-handlers';
import { registerSearchHandlers } from './ipc/search-handlers';
import { registerStatsHandlers } from './ipc/stats-handlers';
import { registerStatusHandlers } from './ipc/status-handlers';
import { configureTests, createTestTrustStore } from '@midnite/studio-feature-tests/main';
import { registerTestsFeatureHandlers } from './ipc/tests-feature-handlers';
import { defaultLogger, setLogSink, type Logger } from './log';
import { installMenu } from './menu';
import { startStudioRuntimeHost, studioRuntimeDirectory } from './runtime-host';
import {
  detachAll,
  getSharedBrokerLocation,
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
  watchSessionExits,
} from './terminal-service';
import { configureRegistry, listRepos, openRepo, restoreRepos } from './repo-registry';
import { reconcileWatchers, stopAllWatchers } from './watch-service';
import { initFetchScheduler, reconcileFetchScheduler } from './fetch-scheduler';
import { registerSettingsHandlers } from './ipc/settings-handlers';
import { createConnectionsStore, createCredentialVault } from '@midnite/studio-feature-database/main';
import { createTrustStore } from './diagnostics/trust-store';
import { createRepoStore } from './repo-store';
import { getMcpServerHandle, registerMcpServer } from './mcp';
import { registerMcpHandlers } from './ipc/mcp-handlers';
import { fingerprintFile } from './socket-name';
import { configureCouncils, createCouncilsRunsStore, createCouncilsStore } from '@midnite/studio-feature-councils/main';
import { stopDemoApi } from '@midnite/studio-feature-workflows/main';
import { registerWorkflowHandlers } from './ipc/workflow-handlers';
import { registerVideoHandlers } from './ipc/video-handlers';
import { registerMediaHandlers, stopMediaWatchers } from './ipc/media-handlers';
import { configureMusicBroker, disposeMusicBroker, registerMediaAudioHandlers } from './ipc/media-audio-handlers';
import { registerMediaMusicHandlers } from './ipc/media-music-handlers';
import { registerMediaImageHandlers } from './ipc/media-image-handlers';
import { disposeMediaLibraryLan, registerMediaLibraryHandlers } from './ipc/media-library-handlers';
import { captureGate, disposeCapture, registerCaptureHandlers } from './ipc/capture-handlers';
import type { PermissionDetails as CapturePermissionDetails } from '@midnite/studio-feature-capture/main';
import { engines as modelEngines, registerMediaModelHandlers } from './ipc/media-model-handlers';
import { registerMediaSpriteHandlers } from './ipc/media-sprite-handlers';
import { disposeMapCaptureBroker, installMapTileProtocol, registerMediaMapHandlers } from './ipc/media-map-handlers';
import { disposeTerrainBroker, registerMediaTerrainHandlers } from './ipc/media-terrain-handlers';
import { configureSf3d, disposeSf3d } from './ipc/media-model-sf3d-handlers';
import {
  configureVideo,
  createProjectsStore as createVideoProjectsStore,
  effectiveVideoRoot,
  stopAllVideoProcesses,
} from '@midnite/studio-feature-media-video/main';
import { registerOllamaHandlers } from './ipc/ollama-handlers';
import { configureOllamaSettings, createOllamaSettingsStore } from '@midnite/studio-feature-models/main';
import { migrateAnyLegacyRepoStore } from './userdata-migration';
import { installMgitFileProtocol, registerPrivilegedSchemes, setVideoFileRootProvider } from './fs-protocol';
import { registerPerfHandlers } from './ipc/perf-handlers';
import { registerReportHandlers, setBootLine } from './ipc/report-handlers';
import { createFileSink } from './log-sink';
import { bootMark } from './perf-marks';
import { startHeapSampler } from '../heap-sampler';
import { ensureLoginShellPathAsync } from './shell-path';
import { applyAppWebContentsPolicy } from './web-contents-policy';
import { createWindow } from './window';
import { registerWindowChrome } from './window-chrome';
import {
  beginShutdown,
  broadcastToAllWindows,
  closeAllPopouts,
  configureReopenStore,
  configureWindowsStore,
  createRoleWindow,
  registerMainWindow,
  restoreReopenedPopouts,
} from './window-manager';
import { registerWindowHandlers } from './ipc/window-handlers';
import { registerGamesHandlers } from './ipc/games-handlers';
import {
  createGameAgentService,
  createGameLoop,
  createGamesRuntime,
  type GameService,
} from '@midnite/studio-feature-media-game/main';
import { asGameWindow, asPopoutWindow, createStudioGameElectron } from './games/game-electron';
import { createLlmCall } from '@midnite/studio-feature-media-model/main';
import { createIterativeHost } from './media/iterative-host';
import { setGameTools } from './mcp/game-tools';
import { exportTerrain } from '@midnite/studio-feature-media-terrain/main';
import { gameEnginesDir, mediaGameTemplateRoot } from './template-path';
import { createReopenStore, createWindowsStore } from './windows-store';
import type { StartStudioMain } from './main-contract';

/**
 * Electron main entry point.
 *
 * Owns everything the renderer cannot: git (through @midnite/studio-git-engine),
 * node-pty, the filesystem, and the native window. The renderer reaches all of
 * it through the typed bridge in ../preload.
 */

let mainWindow: BrowserWindow | null = null;
const getMainWindow = (): BrowserWindow | null => mainWindow;

/** Media ▸ Games' service, created at boot (Phase 107); read at quit to stop every run. */
let gameService: GameService | null = null;
let gameAgentService: ReturnType<typeof createGameAgentService> | null = null;

/** The vault host other apps read through (`runtime-host.ts`); closed at quit so its socket goes with it. */
let runtimeHost: VaultHost | null = null;

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
  // `log.error` since Phase 65 Theme D — the line was always this good, it just
  // went to a stderr a packaged app discards.
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`[renderer] gone reason=${details.reason} exit=${details.exitCode}`);
    if (details.reason === 'clean-exit') return;
    if (win.isDestroyed()) return;
    win.webContents.reload();
  });
  /*
    A hung main window — recorded, not acted on. Until this, `unresponsive` was
    bound only for embedded browser tabs (the browser feature's `browser-service.ts`), so the failure
    a user is most likely to actually report was the one that left no trace.
    Electron recovers from most of these unaided, so killing the window would be
    a worse bug than the one being logged; the `responsive` line is what tells a
    reader afterwards which it was.
  */
  win.webContents.on('unresponsive', () => {
    log.error('[renderer] unresponsive');
  });
  win.webContents.on('responsive', () => {
    log.info('[renderer] responsive again');
  });
}

/**
 * Studio's Electron main, started by its entry — `apps/studio/entry/main.ts`
 * (Phase 113 Theme G), which esbuild bundles as `dist/bundle/main.js`.
 *
 * Everything in here was this module's top-level body, in the same order: the
 * module itself now only declares, so importing it starts nothing, and the
 * app that composes Studio is what boots it. Call it once.
 */
export const startStudioMain: StartStudioMain = () => {
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
    The first line of Studio's main boot, and therefore the first moment every
    static import above has been evaluated — the entry calls this only once its
    own import of this module has resolved, so this is where the import graph's
    cost has already been paid. Theme B's one number for "how expensive is main's
    module graph"; it needs no `app` and must stay first.
  */
  bootMark('modules-loaded');
  startHeapSampler({ enabled: perfEnabled(process.env), processName: 'main', log: defaultLogger });

  app.setName('Midnite Studio');

  /*
    Main's own crashes, recorded — Phase 65 Theme D.

    Installed here rather than inside `whenReady` on purpose: the boot path is
    where an unhandled rejection is both most likely and most invisible, and a
    handler registered after `whenReady` cannot see the ones raised before it.
    Neither handler exits. Electron's default for an uncaught exception in main is
    to log it and keep running, and this phase changes what is RECORDED, not what
    the app does — turning a survivable exception into a quit would be a
    behaviour change smuggled in under a logging one.
  */
  process.on('uncaughtException', (err) => {
    defaultLogger.error('[main] uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    defaultLogger.error('[main] unhandledRejection', reason);
  });

  /*
    A GPU or utility process dying — the only hook that reports it, and it had
    none until Phase 65. This class of failure currently manifests to a user as
    "the window went strange" with no record at all, which is exactly the report
    nobody can act on.
  */
  app.on('child-process-gone', (_event, details) => {
    defaultLogger.error(
      `[main] child-process-gone type=${details.type} reason=${details.reason} exit=${details.exitCode}${
        details.name === undefined ? '' : ` name=${details.name}`
      }`,
    );
  });

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

    const win = getMainWindow();
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
    registerPrivilegedSchemes();

    void app.whenReady().then(async () => {
      bootMark('when-ready');
      /*
        The app renderer's permission policy, before any window exists to ask
        (Phase 79 Theme F).

        Electron *approves* most permission requests in a session with no handler
        installed, so until this line the app's own UI could have had the camera
        and the screen for the asking — only the browser pane was actually
        policed. `allowAppAudioOnly` replaces that default with exactly one hole:
        `media`, audio only, from our own origin. The browser pane is a different
        session (`persist:browser`) and keeps `denyAllPermissions`.

        The dev-server origin is passed only when the renderer is actually loaded
        from it, so a packaged build's dev branch is unreachable rather than
        merely unused — `loadRenderer` in `window.ts` makes the same choice from
        the same two conditions.
      */
      const devServerOrigin =
        !app.isPackaged && process.env['MSTUDIO_USE_BUILT_RENDERER'] !== '1'
          ? (process.env['MSTUDIO_RENDERER_URL'] ?? 'http://localhost:5173')
          : null;
      /*
        Phase 113 Theme K — Capture's recording gate is the second hole, and only while armed: the
        user pressed Record on one source, so the next `getDisplayMedia` from our own main frame gets
        that source's video (never audio) and disarms it. Unarmed, the handler answers no stream.
      */
      const recordingGate = captureGate(devServerOrigin);
      allowAppAudioOnly(session.defaultSession, devServerOrigin, (permission, details, origin) =>
        recordingGate.allowsPermission(permission, details as CapturePermissionDetails | undefined, origin),
      );
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) =>
        recordingGate.handleRequest(request, callback as Parameters<typeof recordingGate.handleRequest>[1]),
      );
      // Phase 91 Theme E: one navigation/window.open net for every app window, installed before any
      // exists (`web-contents-created` is only seen by listeners registered ahead of the contents).
      app.on('web-contents-created', (_event, contents) => {
        applyAppWebContentsPolicy(contents, devServerOrigin, (href) => void shell.openExternal(href));
      });
      // Phase 91 Theme E: no WebUSB/HID/serial device chooser for the app renderer. Display media
      // stays Capture's gate above, hence `displayMedia: false`.
      denyAllDevices(session.defaultSession, { displayMedia: false });
      installCsp(session.defaultSession, {
        dev: devServerOrigin !== null,
        devServerOrigin,
      });
      registerWindowChrome();
      registerRepoHandlers(getMainWindow);
      registerSearchHandlers();
      registerStatusHandlers();
      registerConflictHandlers();
      registerStatsHandlers();
      registerRebaseHandlers();
      registerRefHandlers();
      registerRemoteHandlers();
      registerHooksHandlers();
      registerClipboardHandlers();
      registerRepoLogoHandlers();
      registerAiHandlers();
      // Phase 84 Themes B/C: auto-fetch and forge polling both move to main,
      // one instance for the whole process regardless of how many windows are
      // open. `initFetchScheduler` is reconciled below alongside the watchers;
      // the forge poller needs no such reconciliation — it is entirely
      // subscription-driven (`registerForgePollHandlers`), so a repo closing
      // just means its views unmount and unsubscribe on their own.
      initFetchScheduler(defaultLogger);
      // Captured in a local (previously built anonymously right into the
      // register call) so Phase 97 Theme H's trigger scheduler can subscribe
      // its own `forge-pr` triggers onto this SAME instance below — one
      // poller for the whole process, never a second one.
      // The forge feature's channels (Phase 113 Theme O) — listings, writes,
      // accounts, projects and the poll subscriptions — register here, onto it.
      const forgePoller = createStudioForgePoller();
      registerForgeFeatureHandlers(forgePoller);
      registerSettingsHandlers();
      registerDiagHandlers();
      registerSessionsHandlers();
      registerNotesHandlers();
      registerChatsHandlers();
      // The Database feature's channels (Phase 113 Theme O) register below, beside its stores and the vault.
      registerKnowledgeHandlers();
      registerScaffoldHandlers();
      registerTestsFeatureHandlers(getMainWindow);
      registerPtyHandlers(getMainWindow);
      // The browser feature's channels (Phase 113 Theme L) — browser tabs and the web-apps rail, one registration.
      registerBrowserFeatureHandlers(getMainWindow);
      // Phase 84 Theme F: one process-wide idle sweep, started once — every
      // discard eligibility check reads live `WebContentsView`/`BrowserWindow`
      // state at tick time, so there is nothing to reconcile per repo or per
      // window the way `watch-service.ts`'s watchers are.
      startBrowserDiscardSweep();
      startWebAppsDiscardSweep();
      registerWindowHandlers(getMainWindow, defaultLogger);
      // Phase 81 Theme F: `ui-bridge.ts` targets `getMainWindow()` explicitly,
      // never the focused window — registered here, once, the same way every
      // other main-window consumer below gets the same thunk.
      configureUiBridge(getMainWindow);
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
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send(EVENT_CHANNELS.ptyAgentChanged, event);
              }
            },
            (event) => {
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send(EVENT_CHANNELS.ptyCommandChanged, event);
              }
            },
          ),
        ),
      );
      const metrics = registerMetricsHandlers(getMainWindow);
      registerTerminalHandlers();
      registerFsHandlers();
      registerFsWriteHandlers();
      registerFsSearchHandlers();
      registerClaudeHandlers(getMainWindow);
      registerCliHandlers();
      registerCouncilHandlers();
      registerLoopRunsHandlers();
      registerVideoHandlers();
      registerMediaHandlers();
      registerMediaImageHandlers();
      registerMediaLibraryHandlers();
      registerCaptureHandlers(getMainWindow);
      registerMediaAudioHandlers();
      registerMediaMusicHandlers();
      registerMediaModelHandlers();
      registerMediaTerrainHandlers();
      registerMediaSpriteHandlers();
      registerMediaMapHandlers();
      registerOllamaHandlers(getMainWindow);
      registerSecretsHandlers();
      registerFinanceHandlers();
      registerApiClientFeatureHandlers(getMainWindow);
      registerMcpHandlers();
      registerCompanionHandlers();
      registerUpdater(getMainWindow);
      registerReleaseNotesHandlers();
      handle(
        CHANNELS.setupProbe,
        SetupProbeRequest,
        (req) => probeSetupItems(req.ids),
        () => ({ results: [] }),
      );
      handle(
        CHANNELS.setupReveal,
        SetupRevealRequest,
        async (req) => {
          const found = (await probeSetupItems([req.id])).results[0];
          if (!found?.installed || !found.path) return { ok: false, message: 'tool path unknown' };
          shell.showItemInFolder(found.path);
          return { ok: true };
        },
        () => ({ ok: false, message: 'invalid request' }),
      );
      handleBare(CHANNELS.gitIdentityGet, () => getGlobalGitIdentity());
      handle(
        CHANNELS.gitIdentitySet,
        GitIdentitySetRequest,
        (req) => setGlobalGitIdentity(req),
        (issue) => failure(issue),
      );
      handleBare(CHANNELS.systemMemory, () => ({ totalBytes: totalmem() }));
      registerOptimizerHandlers(getMainWindow);
      registerTrashHandlers();
      registerPerfHandlers();
      registerReportHandlers({ log: defaultLogger });
      installMgitFileProtocol();
      installMapTileProtocol();
      installMenu(getMainWindow);
      bootMark('handlers-registered');

      // Restore before the window opens: the renderer's first `repo:list` fires
      // on mount, and an empty answer there shows the empty state for a frame
      // even though repos are about to appear.
      const userData = app.getPath('userData');
      /*
        The file under main's one log seam — Phase 65 Theme A.

        Constructed here, beside every other `userData` writer and from the same
        once-resolved directory, because that injection convention is what keeps
        `electron` out of the sink's module graph and lets it be tested under bare
        vitest. `onFailure` goes to the console rather than back through the
        logger: the logger is what just failed.
      */
      const logSink = createFileSink({
        dir: join(userData, 'logs'),
        name: 'main.log',
        homeDir: app.getPath('home'),
        // eslint-disable-next-line no-console
        onFailure: (message) => console.error(message),
      });
      setLogSink(logSink);
      // Buffered `info`/`warn` lines flush on the next tick, and a quit can beat
      // it. `error` was already synchronous; this is what stops the ordinary
      // lines leading up to a clean exit from being the ones that vanish.
      app.on('will-quit', () => logSink.close());
      /*
        Every log file's first line, so a pasted tail identifies its build without
        the reporter being asked.

        `brokerBuild` is labelled honestly: `fingerprintFile` hashes whichever
        file it is given, and the one this app fingerprints is `broker.js` — the
        BROKER's build, not main's. `app.getVersion()` plus `isPackaged` already
        identify the app build for every purpose a bug report has, and
        fingerprinting the main bundle is a build-system question rather than a
        logging one.
      */
      const bootLine = [
        `midnite-studio ${app.getVersion()}`,
        `packaged=${String(app.isPackaged)}`,
        `brokerBuild=${fingerprintFile(join(__dirname, 'broker.js').replace('app.asar', 'app.asar.unpacked'))}`,
        `electron=${process.versions.electron ?? '?'}`,
        `chrome=${process.versions.chrome ?? '?'}`,
        `node=${process.versions.node}`,
        `${process.platform}/${process.arch}`,
      ].join(' ');
      setBootLine(bootLine);
      defaultLogger.info(`[boot] ${bootLine}`);
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
      /*
        Off by default (Decision 8): `registerMcpServer` reads the enable flag
        first and only binds a socket when it is `true` — Theme F's Settings
        switch (`registerMcpHandlers`, just below) is what can now turn it on,
        live, without a restart. Placed after the repo registry is configured
        so a tool call reaching the socket the instant it opens never sees an
        empty registry.
      */
      await registerMcpServer({
        userDataDir: userData,
        appVersion: app.getVersion(),
        buildId: fingerprintFile(join(__dirname, 'main.js')),
        isPackaged: app.isPackaged,
        log: defaultLogger,
        launcherAppDataDir: app.getPath('appData'),
      });
      // Not awaited: nothing reads this until a user detaches a panel, long
      // after boot — awaiting it here would serialize a disk read ahead of the
      // three parallel chains below for data with no reader yet.
      const windowsStore = createWindowsStore(userData);
      void windowsStore.load().then((initial) => configureWindowsStore(windowsStore, initial));
      configureReopenStore(createReopenStore(userData));
      // Loaded lazily on the first GitLab reachable-repos listing, not here.
      configureGitlabLanguageCache(createGitlabLanguageCacheStore(userData));
      /*
        One store, two consumers, and the order matters: `configureSessions` hands
        it to the IPC handlers so the renderer can read the archive, and
        `configureTerminals` hands it the same instance so a close can write to
        it. Sharing one instance rather than constructing two is what keeps the
        lazy cache coherent — two stores over the same file would each hold a
        copy, and the reader's would go stale the moment the writer appended.
      */
      const sessionHistory = createSessionHistoryStore(userData);
      configureSessions(sessionHistory);
      configureTerminals(createTerminalStore(userData), userData, sessionHistory);
      configureCouncils(createCouncilsStore(userData), createCouncilsRunsStore(userData));
      /*
        Wired here beside councils rather than in a boot chain: it is synchronous
        module-state assignment, and a `workflow:list` can arrive on the
        renderer's first paint. The workflows feature configures its own stores,
        arms `trigger` nodes (cron schedules, forge-pr subscriptions over the SAME
        `forgePoller` instance above — Phase 97 Theme H) and starts the gate
        approval poll (Phase 97 Theme D: the PR/issue comment channel, at
        `forge-poller.ts`'s own cadence, unconditional rather than
        subscription-gated — it costs nothing with nothing waiting).
      */
      registerWorkflowHandlers({ userData, forgePoller, getMainWindow, gateApprovalPollMs: FORGE_POLL_MS });
      configureVideo(createVideoProjectsStore(userData), {
        emit: (channel, payload) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
        },
        showItemInFolder: (path) => shell.showItemInFolder(path),
        openPath: (path) => shell.openPath(path),
      });
      setVideoFileRootProvider(effectiveVideoRoot);
      // Media ▸ Games (Phase 107): one service over the runner, the settings
      // file and the repo registry. Registering a game repo is the same path
      // `repoClone` takes — `openRepo`, then reconcile the watchers.
      // The services and their wiring are the `media-game` feature's (`createGamesRuntime`); this hands it
      // Studio's Electron, repo registry and popout window.
      const games = createGamesRuntime<WebContentsView>({
        userData,
        log: defaultLogger,
        send: broadcastToAllWindows,
        getWindow: asGameWindow(getMainWindow),
        electron: createStudioGameElectron(),
        templateDir: mediaGameTemplateRoot(),
        enginesDir: gameEnginesDir(),
        registerRepo: async (path) => {
          const opened = await openRepo(path);
          if (!opened.ok) return { ok: false, kind: 'error', message: opened.message };
          const repos = (await listRepos()).map((repo) => ({ id: repo.id, path: repo.path }));
          await reconcileWatchers(repos);
          reconcileFetchScheduler(repos);
          return { ok: true };
        },
        listRepoPaths: async () => (await listRepos()).map((repo) => repo.path),
        repoIdOf: async (path) => (await listRepos()).find((repo) => repo.path === path)?.id ?? null,
        // Pop out (Theme B): the `game` role window hosts one game's view.
        openPopoutWindow: asPopoutWindow(() => createRoleWindow('game', defaultLogger)),
        // A terrain pack imported as a game asset is exported by the Terrain feature's own code.
        exportTerrain,
      });
      gameService = games.service;
      const mcpGameService = gameService;
      // Play-tests (Theme O) and the `game_*` MCP tools (Theme D), wired by the feature over the runtime; the
      // global server's consent gate is `mcp/game-tools.ts`.
      const { playtests: gamePlaytests, tools: gameMcpTools } = createGameLoop<WebContentsView>({
        runtime: games,
        contents: (view) => view.webContents,
      });
      setGameTools(gameMcpTools);
      // Create and iterate (Theme M): agent CLIs on a private MCP server, or Ollama, one commit per changing pass.
      const gameLlm = createLlmCall(modelEngines);
      gameAgentService = createGameAgentService({
        resolve: (gameId) => mcpGameService.resolve(gameId),
        squashRunCommits: async () => (await mcpGameService.settings.get()).settings.squashRunCommits,
        host: createIterativeHost(),
        tools: () => gameMcpTools,
        ollama: ({ model, prompt, signal }) => gameLlm({ engine: { kind: 'ollama', model }, repoId: '', prompt, signal, json: true }),
        send: broadcastToAllWindows,
        log: defaultLogger,
      });
      registerGamesHandlers(games, gameAgentService, gamePlaytests);
      configureOllamaSettings(createOllamaSettingsStore(userData));
      configureDiagnostics(createTrustStore(userData));
      configureTests(createTestTrustStore(userData));
      /*
        The runtime vault (Phase 113 Theme D): one service over the three vault
        files that already sit in `userData`, encrypted with this process's
        `safeStorage` — Studio's main process is the runtime today. Studio
        reads through it as the `studio` app; the three bindings below keep the
        shapes their handlers always had, and the wire still says only
        `hasToken`.
      */
      // Grants (Phase 113 Theme J slice 2): Studio is always allowed; the grants only gate other apps' services.
      const vaultGrants = createVaultGrants({ directory: userData });
      // Which key each guest app paired with — the host checks it, Studio's Vault view lists and unpairs.
      const runtimeDirectory = studioRuntimeDirectory(app.getPath('appData'), userData);
      const vaultPairings = createPairingStore({ hostDirectory: runtimeHostDirectory(runtimeDirectory) });
      configureVaultGrants(vaultGrants, vaultPairings);
      const vaultService = createVaultService({
        directory: userData,
        cipher: safeStorage,
        authorize: vaultGrants.authorize,
      });
      const studioVault = vaultService.forApp('studio');
      // Passwords live in this vault's `db-credentials` namespace and are read here, in main, to open a connection.
      registerDatabaseFeatureHandlers(getMainWindow, {
        connections: createConnectionsStore(userData),
        credentials: createCredentialVault(studioVault),
      });
      configureSecrets(createSecretsVault(studioVault));
      /*
        The account registry (Phase 90 Theme B) — wired here beside every other
        userData store. `configureForgeAccounts` itself kicks off the on-disk
        load without blocking boot on it; `forge-accounts.ts`'s own `ensureLoaded`
        is what a handler awaits if it fires before that resolves.
      */
      configureForgeAccounts(createForgeAccountsStore(userData), createForgeAccountVault(studioVault));
      /*
        The Knowledge view's layout cache — keyed on `built_at_commit` plus the
        projection format version (Phase 87, Decision 2). Its own subdirectory
        under `userData`, never inside a repo's `graphify-out/`: that directory
        is graphify's own, and writing into it risks a `graphify uninstall
        --purge` deleting our cache or an incremental update misreading it.
      */
      configureKnowledge(join(userData, 'knowledge-cache'));
      configureNotes(createNotesStore(userData), { userData, appData: app.getPath('appData') });
      configureChats(userData);
      /*
        The companion's per-repo "last greeted" mark (Phase 79 Theme B, Decision
        11) — a `companion.json` beside `mcp.json`, wired here beside every other
        `userData` store. Synchronous module-state assignment, like the rest: a
        `companion:digest` can arrive on the renderer's first paint.
      */
      configureCompanion(createCompanionStore(userData));
      /*
        The recogniser's key (Theme F), in its own `safeStorage` vault beside the
        database one. Wired here rather than lazily because `configured()` is
        what the Settings page reads on mount, and a lazily-created vault would
        answer "nothing configured" on the first read of every launch.
      */
      configureStt(createSttCredentials(userData));
      /*
        The local, key-free recogniser (Ad Hoc: the microphone must work with
        no API key). Wired here beside `configureStt` for the same reason: it
        shares `userData`, and nothing native loads until the first
        transcription request — `sherpa-local.ts`'s own lazy `require()`.
      */
      configureLocalStt(userData);
      /*
        The local voice engine (Phase 80 Theme C; off the main thread onto its
        own `utilityProcess` as of Ad Hoc "TTS synthesis blocks the UI"). Wired
        here beside every other `userData` store, but nothing spawns and
        nothing native loads until the first synthesis or status request —
        `tts-broker.ts` forks lazily, and the worker's own `tts.ts` copy loads
        Kokoro lazily inside that process exactly as it always loaded it here,
        mirroring `inproc-pty.ts`'s `loadNodePty()`.
      */
      configureCompanionTtsBroker(userData);
      // Media ▸ Audio's local music engine — same lazy-fork shape; weights cache under `userData/audio-models`.
      configureMusicBroker(userData);
      configureSf3d(userData);

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
            getWindow: getMainWindow,
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
          configureLoopRuns(createLoopRunsStore(userData), getMainWindow);
          onSessionExit(noteSessionExit);
          // The second consumer of the same seam: a session's exit code, kept
          // until the close that archives it finally comes (Phase 67).
          watchSessionExits();
          /*
            Studio as the runtime host (docs/APPS.md, "The shared data plane"): the other apps read
            its vault over a socket — behind its grants, never with a cipher of their own — and find
            its broker through the host record. After the pty service, so the record names the
            broker it actually reached.
          */
          void startStudioRuntimeHost({
            runtimeDirectory,
            service: vaultService,
            grants: vaultGrants,
            pairings: vaultPairings,
            broker: getSharedBrokerLocation(),
            sessionsFile: join(userData, 'terminals.json'),
            pid: process.pid,
            log: (msg) => defaultLogger(msg),
          }).then((host) => {
            runtimeHost = host;
          });
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
        and `restoreRepos` to finish against a `getMainWindow()` that returns null
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
              outcome.reason instanceof Error
                ? (outcome.reason.stack ?? outcome.reason.message)
                : String(outcome.reason)
            }`,
          );
        }
      });

      /*
        The agent install probe starts here — after `whenReady`, fire and forget,
        and ahead of the window so it overlaps Chromium's load instead of
        following it. Not awaited: it must never delay first paint. It waits on
        the login-shell PATH itself, and every renderer load re-forces it
        (`bindAgentProbeToWindow`).
      */
      loginShellReady.then(() => startAgentProbeAtBoot()).catch(() => undefined);

      mainWindow = createWindow();
      bootMark('create-window');
      registerMainWindow(mainWindow);
      // Detached windows that were open at the last shutdown (Notes) come back.
      void restoreReopenedPopouts(defaultLogger);
      mainWindow.on('closed', () => {
        // The main window is the app; popouts are satellites of it.
        closeAllPopouts();
        mainWindow = null;
      });
      // Sampling follows visibility: blurred, hidden or minimized stops it
      // outright rather than spending an `ioreg` spawn every few seconds on a
      // footer nobody can see.
      bindMetricsToWindow(metrics, mainWindow);
      bindRenderProcessGone(mainWindow, defaultLogger);
      bindAgentProbeToWindow(mainWindow);

      if (pendingDeepLink) {
        handleDeepLinkUrl(pendingDeepLink);
        pendingDeepLink = null;
      }

      // Periodic scrollback flush, so a crash or a force-quit still leaves
      // something to restore rather than only the last clean exit.
      startTerminalFlush();

      // Watch what was restored. After this the handlers reconcile on every
      // open/close, so there is exactly one place that starts a watcher at boot.
      await reconcileWatchers((await listRepos()).map((repo) => ({ id: repo.id, path: repo.path })));
      reconcileFetchScheduler((await listRepos()).map((repo) => ({ id: repo.id, path: repo.path })));

      // macOS: clicking the dock icon with no windows open reopens one.
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createWindow();
          registerMainWindow(mainWindow);
          void restoreReopenedPopouts(defaultLogger);
          mainWindow.on('closed', () => {
            closeAllPopouts();
            mainWindow = null;
          });
          // The reopened window is a new BrowserWindow, so it carries none of
          // the visibility listeners the first one was given. Without this the
          // sampler never pauses again for the rest of the session.
          bindMetricsToWindow(metrics, mainWindow);
          bindRenderProcessGone(mainWindow, defaultLogger);
          bindAgentProbeToWindow(mainWindow);
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
    let mcpClosed = false;
    app.on('before-quit', (event) => {
      beginShutdown();
      /*
        `before-quit` is synchronous and `McpServerHandle.close()` is not
        (Phase 57 Theme B), so `close()` is called fire-and-forget and the
        socket file is unlinked here too, synchronously, inside its own
        try/catch — the OS reclaims the descriptor either way, but the file is
        what must not outlive the process, and this is the part of the cleanup
        that has to complete before exit, not just be asked for. Guarded so a
        second `before-quit` (fired by this same handler's own `app.quit()`
        call below) does not try to close it twice.
      */
      const mcpHandle = getMcpServerHandle();
      if (!mcpClosed && mcpHandle) {
        mcpClosed = true;
        void mcpHandle.close();
        try {
          unlinkSync(mcpHandle.socketPath);
        } catch {
          // Best-effort — close() above will also have tried.
        }
      }

      // The vault host's socket must not outlive Studio: close it (and unlink, synchronously, like MCP's).
      if (runtimeHost) {
        const host = runtimeHost;
        runtimeHost = null;
        void host.close();
        try {
          unlinkSync(host.socketPath);
        } catch {
          // Best-effort — close() above unlinks it too.
        }
      }

      disposeChats();
      // The global capture chord is released and clipboard polling stops with the app (Phase 113 Theme K).
      disposeCapture();
      // The Library's LAN server and any ffmpeg it runs stop with the app (Phase 113 Theme R slice 2).
      disposeMediaLibraryLan();
      stopAllWatchers();
      stopMediaWatchers();
      destroyAllBrowserTabs();
      destroyAllWebApps();
      // A `remotion studio` or an in-flight render surviving the app is a port
      // leak / an orphaned headless Chrome the user cannot see — Theme C's own
      // doc names this exact wiring as its one open item, owned by Theme H.
      stopAllVideoProcesses();
      // Every running game is a renderer process of its own.
      gameAgentService?.cancelAll();
      gameService?.stopAll();
      // The pm.* script runner's utilityProcess (Phase 70 Theme B) — same
      // reasoning as the two calls below: nothing in it is worth flushing,
      // only worth not leaving behind.
      shutdownApiClientFeature();
      // The local voice engine's own utilityProcess (Ad Hoc "TTS synthesis
      // blocks the UI") — the identical reasoning, one call below it.
      disposeCompanionTtsBroker();
      disposeMusicBroker();
      disposeSf3d();
      disposeTerrainBroker();
      disposeMapCaptureBroker();
      /*
        Fire-and-forget: `closeAllConnections()` inside makes the close immediate
        rather than waiting out a keep-alive socket, and the demo API holds no
        state worth flushing — it is in-memory by design, and stopping it
        discards everything on purpose.
      */
      void stopDemoApi();
      // Fire-and-forget, same reasoning: a pooled DB connection holds no state
      // worth flushing across a restart, so closing the socket is the whole job.
      void shutdownDatabaseFeature();

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
      stopMediaWatchers();
      destroyAllBrowserTabs();
      destroyAllWebApps();
      // macOS apps conventionally stay alive with no windows; everywhere else,
      // closing the last window quits.
      if (process.platform !== 'darwin') app.quit();
    });
  }
};
