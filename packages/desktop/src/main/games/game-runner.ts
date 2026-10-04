import { randomBytes } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';

import { WebContentsView, session, type BrowserWindow, type Session } from 'electron';

import {
  EVENT_CHANNELS,
  failure,
  GAME_CONSOLE_BATCH_MS,
  GAMES_MAX_RUNNING,
  MSTUDIO_GAME_SCHEME,
  ok,
  type BrowserBounds,
  type GameLogEntry,
  type GameNetwork,
  type GameRunState,
  type GitOpResult,
} from '@midnite/studio-shared';

import { cancelDownload } from '../browser-security';
import type { Logger } from '../log';
import { gameProtocolHandler } from './game-protocol';
import { LogRingBuffer, clipLogText } from './ring-buffer';

/**
 * The sandboxed runner (Phase 107 Theme B).
 *
 * AI-written JavaScript runs in a `WebContentsView` of its own — `sandbox:
 * true`, `contextIsolation`, no preload — on a partition no other view shares,
 * served from `mstudio-game://<gameId>/` by a handler installed on THAT session
 * only. It never shares a process with `window.midniteStudio`. Modelled on
 * `apps-service.ts`, with three differences: the partition is per run and
 * in-memory (so Restart starts clean), the page is the user's own repo rather
 * than a third party's site, and every capability is denied unless a game
 * needs it to be a game (fullscreen, pointer lock, audio).
 */

export type RunnableGame = {
  gameId: string;
  /** The game repo's root — the only folder its scheme can read. */
  root: string;
  network: GameNetwork;
  /** `persist:game-<gameId>` instead of a fresh in-memory partition per run. */
  keepSaveData: boolean;
};

export type GameRunnerDeps = {
  /** The window a new run's view attaches to. */
  getWindow: () => BrowserWindow | null;
  log: Logger;
  /** Push an event to the renderer(s). */
  send: (channel: string, payload: unknown) => void;
};

export type GameRunner = {
  run(game: RunnableGame): Promise<GitOpResult<{ runId: string }>>;
  stop(gameId: string): void;
  stopAll(): void;
  reload(gameId: string): GitOpResult;
  setBounds(gameId: string, bounds: BrowserBounds): void;
  setVisible(gameId: string, visible: boolean): void;
  toolbar(gameId: string, action: ToolbarAction, value?: string | number | boolean): Promise<GitOpResult>;
  logs(gameId: string, since?: number): { runId: string | null; entries: GameLogEntry[] };
  view(gameId: string): WebContentsView | null;
  isRunning(gameId: string): boolean;
};

export type ToolbarAction = 'pause' | 'resume' | 'mute' | 'unmute' | 'devtools' | 'overlay';

type Run = {
  runId: string;
  game: RunnableGame;
  view: WebContentsView;
  win: BrowserWindow;
  buffer: LogRingBuffer;
  pending: GameLogEntry[];
  flushTimer: ReturnType<typeof setInterval>;
  watcher: FSWatcher | null;
  reloadTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  state: GameRunState;
  /** Set once a crash was recorded, so `stop` does not overwrite it with `stopped`. */
  crashReason: string | null;
};

/** Path segments whose changes never reload the game. */
const WATCH_IGNORED = ['.git', 'vendor', 'node_modules'];
const WATCH_IGNORED_PREFIXES = ['playtests/results'];
export const GAME_RELOAD_DEBOUNCE_MS = 200;

/** Whether a changed path should trigger a hot reload. Pure — tested directly. */
export function isReloadTrigger(relPath: string | null): boolean {
  if (relPath === null) return true;
  const normal = relPath.split('\\').join('/');
  const segments = normal.split('/');
  if (segments.some((segment) => WATCH_IGNORED.includes(segment))) return false;
  return !WATCH_IGNORED_PREFIXES.some((prefix) => normal === prefix || normal.startsWith(`${prefix}/`));
}

/**
 * `webRequest.onBeforeRequest` policy: only the game's own scheme and in-page
 * `data:`/`blob:` URLs (and DevTools) load. `https:` only with `network: 'on'`;
 * `http:` never.
 */
export function isGameRequestAllowed(rawUrl: string, network: GameNetwork): boolean {
  let protocol: string;
  try {
    protocol = new URL(rawUrl).protocol;
  } catch {
    return false;
  }
  if (protocol === `${MSTUDIO_GAME_SCHEME}:` || protocol === 'data:' || protocol === 'blob:' || protocol === 'devtools:') {
    return true;
  }
  return protocol === 'https:' && network === 'on';
}

/**
 * Permissions a game may be granted: fullscreen, pointer lock, keyboard lock,
 * and `media` only when it asks for no devices (audio autoplay). Everything
 * else — camera, microphone, geolocation, notifications, clipboard — is denied.
 */
export function isGamePermissionAllowed(
  permission: string,
  details?: { mediaTypes?: readonly string[]; mediaType?: string } | null,
): boolean {
  if (permission === 'fullscreen' || permission === 'pointerLock' || permission === 'keyboardLock') return true;
  if (permission === 'media') {
    const types = details?.mediaTypes;
    const single = details?.mediaType;
    return (types === undefined || types.length === 0) && (single === undefined || single === 'unknown');
  }
  return false;
}

/** The partition a run uses. In-memory (no `persist:` prefix) unless the game keeps its save data. */
export function gamePartition(gameId: string, runId: string, keepSaveData: boolean): string {
  return keepSaveData ? `persist:game-${gameId}` : `game-${gameId}-${runId}`;
}

const HOOK_CALL = (method: string, arg = ''): string =>
  `(() => { const m = window.__midnite; if (m && typeof m.${method} === 'function') { m.${method}(${arg}); return true; } return false; })()`;

export function createGameRunner(deps: GameRunnerDeps): GameRunner {
  const runs = new Map<string, Run>();
  const lastBounds = new Map<string, BrowserBounds>();

  const emitState = (run: Run, state: GameRunState, reason?: string): void => {
    run.state = state;
    deps.send(EVENT_CHANNELS.gamesRunState, {
      gameId: run.game.gameId,
      runId: run.runId,
      state,
      ...(reason === undefined ? {} : { reason }),
    });
  };

  const record = (run: Run, entry: Omit<GameLogEntry, 'seq' | 'at'>): void => {
    run.pending.push(run.buffer.push(entry));
  };

  const flush = (run: Run): void => {
    if (run.pending.length === 0) return;
    const entries = run.pending;
    run.pending = [];
    deps.send(EVENT_CHANNELS.gamesConsole, { gameId: run.game.gameId, runId: run.runId, entries });
  };

  function configureSession(ses: Session, game: RunnableGame): void {
    ses.protocol.handle(MSTUDIO_GAME_SCHEME, gameProtocolHandler(game.root, game.gameId, game.network));
    ses.setPermissionRequestHandler((_wc, permission, callback, details) =>
      callback(isGamePermissionAllowed(permission, details as { mediaTypes?: readonly string[] })),
    );
    ses.setPermissionCheckHandler((_wc, permission, _origin, details) =>
      isGamePermissionAllowed(permission, details as { mediaType?: string }),
    );
    // Hardware (USB / HID / serial / Bluetooth) is never available to a game.
    ses.setDevicePermissionHandler?.(() => false);
    ses.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isGameRequestAllowed(details.url, game.network) });
    });
    ses.on('will-download', (_event, item) => {
      cancelDownload(item, (filename) => deps.log(`[games] download refused: game=${game.gameId} file=${filename}`));
    });
  }

  function attachCapture(run: Run): void {
    const wc = run.view.webContents;
    wc.on('console-message', (_event: unknown, level: number, message: string, line: number, sourceId: string) => {
      record(run, {
        level: level >= 3 ? 'error' : level === 2 ? 'warn' : 'log',
        text: message,
        ...(sourceId ? { source: sourceId } : {}),
        ...(typeof line === 'number' ? { line } : {}),
      });
    });
    try {
      wc.debugger.attach('1.3');
      wc.debugger.on('message', (_event: unknown, method: string, params: unknown) => {
        if (method !== 'Runtime.exceptionThrown') return;
        const details = (params as { exceptionDetails?: ExceptionDetails } | null)?.exceptionDetails;
        const frame = details?.stackTrace?.callFrames?.[0];
        const description = details?.exception?.description ?? details?.text ?? 'Uncaught exception';
        record(run, {
          level: 'exception',
          text: description,
          ...(frame?.url ? { source: frame.url } : details?.url ? { source: details.url } : {}),
          ...(typeof (frame?.lineNumber ?? details?.lineNumber) === 'number'
            ? { line: (frame?.lineNumber ?? details?.lineNumber) as number }
            : {}),
        });
      });
      void wc.debugger.sendCommand('Runtime.enable').catch(() => undefined);
    } catch {
      record(run, {
        level: 'warn',
        text: 'Uncaught errors are not captured (the debugger is already attached). Console output still is.',
      });
    }
    wc.on('render-process-gone', (_event: unknown, details: { reason?: string }) => {
      const reason = details?.reason ?? 'unknown';
      run.crashReason = reason;
      record(run, { level: 'crash', text: `The game's process ended (${reason}).` });
      flush(run);
      emitState(run, 'crashed', reason);
    });
  }

  function lockDown(run: Run): void {
    const wc = run.view.webContents;
    const origin = `${MSTUDIO_GAME_SCHEME}://${run.game.gameId}`;
    const guard = (details: { url: string; preventDefault: () => void }): void => {
      let allowed = false;
      try {
        allowed = new URL(details.url).origin === origin;
      } catch {
        allowed = false;
      }
      if (!allowed) details.preventDefault();
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    // Unlike a third-party app, a game may not open the user's browser either.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    // DevTools opens only from the runner toolbar.
    wc.on('before-input-event', (event: { preventDefault: () => void }, input: GameInput) => {
      const key = (input.key ?? '').toLowerCase();
      const chord = (input.meta || input.control) && input.alt && key === 'i';
      if (key === 'f12' || chord) event.preventDefault();
    });
    wc.on('certificate-error', (event: { preventDefault: () => void }) => event.preventDefault());
  }

  function startWatcher(run: Run): void {
    try {
      run.watcher = watch(run.game.root, { recursive: true }, (_event, filename) => {
        if (!isReloadTrigger(filename === null ? null : String(filename))) return;
        if (run.reloadTimer) clearTimeout(run.reloadTimer);
        run.reloadTimer = setTimeout(() => {
          run.reloadTimer = null;
          if (!run.view.webContents.isDestroyed()) run.view.webContents.reloadIgnoringCache();
        }, GAME_RELOAD_DEBOUNCE_MS);
      });
      run.watcher.on('error', () => undefined);
    } catch {
      run.watcher = null;
    }
  }

  function teardown(run: Run): void {
    clearInterval(run.flushTimer);
    if (run.reloadTimer) clearTimeout(run.reloadTimer);
    run.watcher?.close();
    flush(run);
    const { view, win } = run;
    if (!win.isDestroyed()) win.contentView.removeChildView(view);
    const wc = view.webContents;
    if (!wc.isDestroyed()) {
      try {
        wc.debugger.detach();
      } catch {
        // Not attached.
      }
      wc.removeAllListeners();
      wc.close();
    }
  }

  function stop(gameId: string): void {
    const run = runs.get(gameId);
    if (!run) return;
    runs.delete(gameId);
    teardown(run);
    const ms = Date.now() - run.startedAt;
    if (run.crashReason === null) {
      emitState(run, 'stopped');
      deps.log.info(`game run ${gameId} run=${run.runId} stopped ms=${ms}`);
    } else {
      deps.log.info(`game run ${gameId} run=${run.runId} crashed:${run.crashReason} ms=${ms}`);
    }
  }

  const exec = async (run: Run, code: string): Promise<boolean> => {
    try {
      // The page's answer is untrusted: only a literal `true` counts.
      return (await run.view.webContents.executeJavaScript(code)) === true;
    } catch {
      return false;
    }
  };

  return {
    async run(game) {
      if (runs.has(game.gameId)) stop(game.gameId);
      if (runs.size >= GAMES_MAX_RUNNING) {
        return failure(`Stop a running game first (${GAMES_MAX_RUNNING} are running).`);
      }
      const win = deps.getWindow();
      if (!win || win.isDestroyed()) return failure('There is no window to run the game in.');

      const runId = `r${randomBytes(4).toString('hex')}`;
      const partition = gamePartition(game.gameId, runId, game.keepSaveData);
      const ses = session.fromPartition(partition);
      configureSession(ses, game);

      const view = new WebContentsView({
        webPreferences: {
          partition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // No preload: a game must have no path to window.midniteStudio.
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
          experimentalFeatures: false,
          backgroundThrottling: true,
        },
      });
      const run: Run = {
        runId,
        game,
        view,
        win,
        buffer: new LogRingBuffer(),
        pending: [],
        flushTimer: setInterval(() => flush(run), GAME_CONSOLE_BATCH_MS),
        watcher: null,
        reloadTimer: null,
        startedAt: Date.now(),
        state: 'starting',
        crashReason: null,
      };
      runs.set(game.gameId, run);
      win.contentView.addChildView(view);
      const bounds = lastBounds.get(game.gameId);
      if (bounds) applyBounds(run, bounds);

      lockDown(run);
      attachCapture(run);
      startWatcher(run);
      emitState(run, 'starting');

      view.webContents.on('did-finish-load', () => {
        if (run.state === 'starting') emitState(run, 'running');
      });
      view.webContents.on('did-fail-load', (_event: unknown, code: number, description: string, _url: string, isMainFrame: boolean) => {
        if (!isMainFrame || code === -3) return; // -3: aborted by a reload
        record(run, { level: 'error', text: clipLogText(`The game failed to load: ${description}`) });
        run.crashReason = description;
        flush(run);
        emitState(run, 'crashed', description);
      });
      void view.webContents.loadURL(`${MSTUDIO_GAME_SCHEME}://${game.gameId}/index.html`).catch(() => undefined);
      return ok({ runId });
    },

    stop,

    stopAll() {
      for (const gameId of [...runs.keys()]) stop(gameId);
    },

    reload(gameId) {
      const run = runs.get(gameId);
      if (!run) return failure('That game is not running.');
      run.crashReason = null;
      run.view.webContents.reloadIgnoringCache();
      return ok();
    },

    setBounds(gameId, bounds) {
      lastBounds.set(gameId, bounds);
      const run = runs.get(gameId);
      if (run) applyBounds(run, bounds);
    },

    setVisible(gameId, visible) {
      const run = runs.get(gameId);
      if (!run) return;
      run.view.setVisible(visible);
      run.view.webContents.setBackgroundThrottling(true);
    },

    async toolbar(gameId, action, value) {
      const run = runs.get(gameId);
      if (!run) return failure('That game is not running.');
      const wc = run.view.webContents;
      switch (action) {
        case 'pause':
        case 'resume': {
          const hooked = await exec(run, HOOK_CALL(action));
          if (!hooked) return failure('This game has no pause hook.');
          emitState(run, action === 'pause' ? 'paused' : 'running');
          return ok();
        }
        case 'mute':
        case 'unmute':
          wc.setAudioMuted(action === 'mute');
          return ok();
        case 'devtools':
          if (wc.isDevToolsOpened()) wc.closeDevTools();
          else wc.openDevTools({ mode: 'detach' });
          return ok();
        case 'overlay': {
          const hooked = await exec(run, HOOK_CALL('setOverlay', value === false ? 'false' : 'true'));
          return hooked ? ok() : failure('This game has no overlay hook.');
        }
      }
    },

    logs(gameId, since) {
      const run = runs.get(gameId);
      return run ? { runId: run.runId, entries: run.buffer.entriesSince(since) } : { runId: null, entries: [] };
    },

    view: (gameId) => runs.get(gameId)?.view ?? null,
    isRunning: (gameId) => runs.has(gameId),
  };
}

/**
 * CSS px → device px by the window's zoom factor, exactly as `setAppBounds`
 * does: the renderer cannot import `electron`, so it cannot read the factor.
 */
function applyBounds(run: Run, bounds: BrowserBounds): void {
  const factor = run.win.isDestroyed() ? 1 : run.win.webContents.getZoomFactor();
  run.view.setBounds({
    x: Math.round(bounds.x * factor),
    y: Math.round(bounds.y * factor),
    width: Math.round(bounds.width * factor),
    height: Math.round(bounds.height * factor),
  });
}

type GameInput = { key?: string; meta?: boolean; control?: boolean; alt?: boolean };

type ExceptionDetails = {
  text?: string;
  url?: string;
  lineNumber?: number;
  exception?: { description?: string };
  stackTrace?: { callFrames?: { url?: string; lineNumber?: number }[] };
};
