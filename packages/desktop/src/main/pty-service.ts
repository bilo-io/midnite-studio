import { EVENT_CHANNELS, SCROLLBACK_BYTES, type SessionActivity } from '@midnite/studio-shared';
import { BrowserWindow } from 'electron';

import {
  createActivityClock,
  createActivityState,
  type ActivityDetector,
  type ActivityState,
} from './activity-detect';
import type { AgentWatcher } from './agent-watcher';
import {
  createBrokerClient,
  type BrokerClient,
  type BrokerStatus,
} from './broker-client';
import {
  inprocCreatePty,
  inprocDropScrollback,
  inprocKillAllPtys,
  inprocKillPty,
  inprocLivePtyFor,
  inprocPtySessionCount,
  inprocReadScrollback,
  inprocResizePty,
  inprocScrollbackSessionIds,
  inprocSeedScrollback,
  inprocSessionIdFor,
  inprocWritePty,
  isPidAlive as inprocIsPidAlive,
  setInprocAgentWatcher,
} from './inproc-pty';

export function isPidAlive(pid: number): boolean {
  return inprocIsPidAlive(pid);
}

let agentWatcher: AgentWatcher | null = null;
let brokerClient: BrokerClient | null = null;
let getWindowThunk: () => BrowserWindow | null = () => null;

// --- per-window pty output subscriptions (Phase 55) -------------------------
//
// `ptyData`/`ptyExit` used to reach exactly one window — whatever
// `getWindowThunk()` answered. A second window (a detached Terminal popout)
// rendering the SAME session got nothing. Broadcasting to every window was
// the simpler fix but would make every popout pay full output throughput for
// sessions it never renders, against Phase 51's WebGL/backpressure budgeting
// — so this is opt-in, keyed by ptyId, and the main window subscribes to a
// session's output the same way a popout does (see `use-terminal-ipc.ts`).

const ptySubscribers = new Map<string, Set<number>>();

export function subscribeWindowToPty(ptyId: string, win: BrowserWindow): void {
  let ids = ptySubscribers.get(ptyId);
  if (!ids) {
    ids = new Set<number>();
    ptySubscribers.set(ptyId, ids);
  }
  ids.add(win.id);
  win.once('closed', () => {
    ptySubscribers.get(ptyId)?.delete(win.id);
  });
}

export function unsubscribeWindowFromPty(ptyId: string, win: BrowserWindow): void {
  const ids = ptySubscribers.get(ptyId);
  if (!ids) return;
  ids.delete(win.id);
  if (ids.size === 0) ptySubscribers.delete(ptyId);
}

/** Every live, non-destroyed window currently subscribed to `ptyId`'s output. */
export function subscribersFor(ptyId: string): BrowserWindow[] {
  const ids = ptySubscribers.get(ptyId);
  if (!ids) return [];
  const result: BrowserWindow[] = [];
  for (const id of ids) {
    const win = BrowserWindow.fromId(id);
    if (win && !win.isDestroyed()) result.push(win);
  }
  return result;
}

function dropPtySubscribers(ptyId: string): void {
  ptySubscribers.delete(ptyId);
}

// --- per-ptyId listeners (Phase 34) -----------------------------------------
//
// `council-runner.ts` runs in main and needs a pty's own output/exit, but the
// renderer-facing `ptyData`/`ptyExit` broadcast above only reaches
// `ipcRenderer` — main cannot subscribe to its own `webContents.send`. These
// are a second, narrow dispatch point alongside that broadcast, keyed by
// ptyId, for a main-process caller that spawned a pty directly through
// `createPty` rather than through a `TerminalSession`.

const ptyDataListeners = new Map<string, (bytes: Uint8Array) => void>();
const ptyExitListeners = new Map<string, (exitCode: number, signal?: number) => void>();

/** Registers both; overwrites any previous registration for the same ptyId. */
export function onPty(
  ptyId: string,
  onData: (bytes: Uint8Array) => void,
  onExit: (exitCode: number, signal?: number) => void,
): void {
  ptyDataListeners.set(ptyId, onData);
  ptyExitListeners.set(ptyId, onExit);
}

/** Explicit unregister — also happens automatically on exit. */
export function offPty(ptyId: string): void {
  ptyDataListeners.delete(ptyId);
  ptyExitListeners.delete(ptyId);
}

// --- session-exit hooks (Phase 35) -------------------------------------------
//
// A second, session-keyed dispatch beside the ptyId-keyed one above: the loop
// ledger (`loop-runs.ts`) records runs against the SESSION — the durable half —
// and needs the exit even when the renderer that started the run is gone.
// Fires only when the exit could still be mapped to a session: an explicit
// `killPty` removes the mapping first, which is fine — the one caller of
// `killPty` for a loop (Stop) finalises its record through `stopLoopRun`
// before the kill lands.

type SessionExitHook = (sessionId: string, exitCode: number) => void;
const sessionExitHooks: SessionExitHook[] = [];

/**
 * Returns an unsubscribe. Added on the sweep that found this array is
 * append-only with no caller yet needing `off` — one boot-time registration
 * (`main/index.ts`) is not itself a leak, but an array with a `push` and no
 * `delete` is exactly the shape Phase 45's own rule flags, so the seam is
 * here before a second caller needs it rather than after.
 */
export function onSessionExit(hook: SessionExitHook): () => void {
  sessionExitHooks.push(hook);
  return () => {
    const index = sessionExitHooks.indexOf(hook);
    if (index !== -1) sessionExitHooks.splice(index, 1);
  };
}

function notifySessionExit(sessionId: string | undefined, exitCode: number): void {
  if (sessionId === undefined) return;
  for (const hook of sessionExitHooks) hook(sessionId, exitCode);
}

export function setAgentWatcher(watcher: AgentWatcher | null): void {
  agentWatcher = watcher;
  setInprocAgentWatcher(watcher);
}

export function setWindowProvider(provider: () => BrowserWindow | null): void {
  getWindowThunk = provider;
}

// --- activity detection (Theme G) ------------------------------------------

let activityDetector: ActivityDetector | null = null;

type ActivityTracking = {
  decoder: TextDecoder;
  state: ActivityState;
  clock: ReturnType<typeof createActivityClock>;
  /** The agent this ptyId was last seen running, refreshed every chunk. */
  agentId: string | null;
};

const activityTracking = new Map<string, ActivityTracking>();

function emitActivity(ptyId: string, activity: SessionActivity | null): void {
  const win = getWindowThunk();
  if (win && !win.isDestroyed()) {
    win.webContents.send(EVENT_CHANNELS.ptyActivity, { ptyId, activity });
  }
}

/**
 * Install the roster's compiled activity detector.
 *
 * A `null` agentId disable notification tells every pty currently running
 * that agent, rather than leaving their last guess stuck: without it, a
 * detector that trips its time budget mid-session would leave a spinner
 * turning forever for exactly the reason this phase exists.
 */
export function setActivityDetector(detector: ActivityDetector | null): void {
  activityDetector = detector;
}

/** One shared 1s tick drives every tracked pty's decay clock — not a timer each. */
export function tickActivityClocks(): void {
  for (const entry of activityTracking.values()) entry.clock.tick();
}

let activityTicker: ReturnType<typeof setInterval> | null = null;

/**
 * Run the decay tick only while something is actually being tracked
 * (Phase 36 E). `index.ts` used to arm this unconditionally at boot, so a
 * session with no agent running — the common case — still woke the main
 * process every second for the life of the app.
 *
 * Deliberately NOT gated on window focus, unlike the metrics sampler: an agent
 * keeps working while the window is blurred, and a paused clock would freeze
 * its activity glyph at whatever it last showed. The right gate is "is anyone
 * tracked", not "is anyone looking".
 *
 * Called after every mutation of `activityTracking`.
 */
function syncActivityTicker(): void {
  const wanted = activityTracking.size > 0;
  if (wanted && activityTicker === null) {
    activityTicker = setInterval(tickActivityClocks, 1000);
    // Bookkeeping must never hold the process open.
    activityTicker.unref?.();
  } else if (!wanted && activityTicker !== null) {
    clearInterval(activityTicker);
    activityTicker = null;
  }
}

/** Test seam — whether the shared decay tick is currently armed. */
export function __activityTickerArmed(): boolean {
  return activityTicker !== null;
}

/** Wired as `createActivityDetector`'s `onDisabled` from `index.ts`. */
export function notifyActivityDisabled(agentId: string): void {
  for (const [ptyId, entry] of activityTracking) {
    if (entry.agentId !== agentId) continue;
    entry.clock.dispose();
    activityTracking.delete(ptyId);
    emitActivity(ptyId, null);
  }
  syncActivityTicker();
}

export function disposeActivity(ptyId: string): void {
  activityTracking.get(ptyId)?.clock.dispose();
  activityTracking.delete(ptyId);
  syncActivityTicker();
}

/**
 * The detector's current guess for a pty — `null` when it is not tracked or
 * has said nothing yet. Read by `terminal:list` so `hydrate()` can seed the
 * session list: `pty:activity` events fire on a change only, and a renderer
 * that reloads mid-turn would otherwise draw "unknown" until the next change.
 */
export function activityFor(ptyId: string): SessionActivity | null {
  return activityTracking.get(ptyId)?.clock.current() ?? null;
}

/**
 * Read one chunk of pty output for its activity guess. A no-op unless a
 * detector is installed and the pty is currently running an agent with a
 * marker set — an agent with none, or a plain shell, is left entirely alone
 * rather than emitting a manufactured `null`.
 */
export function noteActivity(ptyId: string, bytes: Uint8Array): void {
  if (!activityDetector) return;
  const agentId = agentWatcher?.currentAgentId(ptyId) ?? null;
  if (!agentId || !activityDetector.hasDetector(agentId)) return;

  let entry = activityTracking.get(ptyId);
  if (!entry) {
    entry = {
      decoder: new TextDecoder(),
      state: createActivityState(),
      clock: createActivityClock({
        now: Date.now,
        onChange: (activity) => emitActivity(ptyId, activity),
      }),
      agentId,
    };
    activityTracking.set(ptyId, entry);
    syncActivityTicker();
  } else if (entry.agentId !== agentId) {
    /*
      A different agent is running in this pty now — a plain shell that ran
      one agent, exited it, and started another. Judging the new run's first
      chunks against the previous run's leftover frame buffer would credit or
      blame the wrong agent's output; start detection fresh instead.
    */
    entry.state = createActivityState();
  }
  entry.agentId = agentId;

  const text = entry.decoder.decode(bytes, { stream: true });
  const activity = activityDetector.guess(agentId, entry.state, text);
  if (activity) entry.clock.saw(activity);
}

type SessionInfo = {
  ptyId: string;
  sessionId: string;
  pid: number;
  cols: number;
  rows: number;
  /** Served by a legacy broker peer rather than the current primary — see `BrokerSessionInfo.legacy`. */
  legacy: boolean;
};

const sessions = new Map<string, SessionInfo>();
const sessionIdByPty = new Map<string, string>();

/**
 * Scrollback ownership, audited in Phase 36 F — three maps hold session bytes
 * and only one is authoritative at a time:
 *
 * - `broker/server.ts`'s own map owns the bytes whenever a broker is running.
 *   That process outlives the window, so it has to.
 * - `inproc-pty.ts`'s map owns them in the in-proc fallback
 *   (`MSTUDIO_PTY_INPROC=1`, or no broker available).
 * - *this* map is a read-through mirror, and only in broker mode: it is fed by
 *   the broker's data frames so `readScrollback` can answer the renderer
 *   without a socket round trip. `snapshotCache` below is its cold-start
 *   fallback, not a fourth copy — see `readScrollback`.
 *
 * So the steady-state cost is 2x per live session in broker mode (owner +
 * mirror), each independently capped at `SCROLLBACK_BYTES * 2` by
 * `appendScrollback`, and 1x in-proc. `dropScrollback` clears every holder —
 * including the broker's own, via `forgetScrollback` (Phase 45 Theme C; the
 * broker also self-cleans on pty exit/kill, so this is the explicit-forget
 * path, not the only one). Collapsing the mirror into the broker would save
 * that second copy but adds a socket round trip to every scrollback read —
 * measured as not worth it, see the phase doc's *Not in this phase*.
 */
const scrollbackBySession = new Map<string, Uint8Array>();

/** Bounded by live session count — `dropScrollback` deletes on close. Entries
 *  are only read within 200ms of being written (see `readScrollback`), so a
 *  stale one costs a copy of one session's bytes until that session ends. */
const snapshotCache = new Map<string, { bytes: Uint8Array; timestamp: number }>();

function appendScrollback(sessionId: string, chunk: Uint8Array): void {
  const previous = scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
  const combined = new Uint8Array(previous.length + chunk.length);
  combined.set(previous, 0);
  combined.set(chunk, previous.length);

  const limit = SCROLLBACK_BYTES * 2;
  const kept = combined.length > limit ? combined.subarray(combined.length - limit) : combined;
  scrollbackBySession.set(sessionId, kept);
}

export function readScrollback(sessionId: string): Uint8Array {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    const mem = scrollbackBySession.get(sessionId);
    if (mem && mem.length > 0) return mem;
    const cached = snapshotCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < 200) {
      return cached.bytes;
    }
    return new Uint8Array(0);
  }
  return inprocReadScrollback(sessionId);
}

export async function fetchScrollbackSnapshot(sessionId: string): Promise<Uint8Array> {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    const cached = snapshotCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < 200) {
      return cached.bytes;
    }
    const bytes = await brokerClient.snapshot(sessionId);
    if (bytes.length > 0) {
      scrollbackBySession.set(sessionId, bytes);
      snapshotCache.set(sessionId, { bytes, timestamp: Date.now() });
    }
    return bytes;
  }
  return inprocReadScrollback(sessionId);
}

export function seedScrollback(sessionId: string, bytes: Uint8Array): void {
  scrollbackBySession.set(sessionId, bytes);
  inprocSeedScrollback(sessionId, bytes);
}

export function scrollbackSessionIds(): string[] {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    return [...scrollbackBySession.keys()];
  }
  return inprocScrollbackSessionIds();
}

export function dropScrollback(sessionId: string): void {
  scrollbackBySession.delete(sessionId);
  snapshotCache.delete(sessionId);
  inprocDropScrollback(sessionId);
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    brokerClient.forgetScrollback([sessionId]);
  }
}

export type CreateResult = { ok: true; ptyId: string } | { ok: false; message: string };

export async function initPtyService(deps: {
  userDataDir: string;
  appVersion: string;
  isPackaged: boolean;
  getWindow: () => BrowserWindow | null;
  log?: (message: string) => void;
}): Promise<void> {
  getWindowThunk = deps.getWindow;
  brokerClient = createBrokerClient(deps);
  await brokerClient.init();

  brokerClient.onData((ptyId, bytes) => {
    const sessionId = sessionIdByPty.get(ptyId);
    if (sessionId) {
      appendScrollback(sessionId, bytes);
    }
    agentWatcher?.noteOutput(ptyId);
    noteActivity(ptyId, bytes);
    ptyDataListeners.get(ptyId)?.(bytes);

    for (const win of subscribersFor(ptyId)) {
      win.webContents.send(EVENT_CHANNELS.ptyData, { ptyId, data: bytes });
    }
  });

  brokerClient.onExit((ptyId, exitCode, signal) => {
    // Resolved before the maps are cleaned — after, the answer is gone.
    notifySessionExit(sessionIdByPty.get(ptyId), exitCode);
    sessions.delete(ptyId);
    sessionIdByPty.delete(ptyId);
    agentWatcher?.untrack(ptyId);
    disposeActivity(ptyId);
    ptyExitListeners.get(ptyId)?.(exitCode, signal);
    offPty(ptyId);

    for (const win of subscribersFor(ptyId)) {
      win.webContents.send(EVENT_CHANNELS.ptyExit, {
        ptyId,
        exitCode,
        ...(signal === undefined ? {} : { signal }),
      });
    }
    dropPtySubscribers(ptyId);
  });

  // Re-hydrate running sessions if any
  if (brokerClient.getStatus().mode === 'broker') {
    const running = await brokerClient.listSessions();
    for (const r of running) {
      sessions.set(r.ptyId, {
        ptyId: r.ptyId,
        sessionId: r.sessionId,
        pid: r.pid,
        cols: r.cols,
        rows: r.rows,
        legacy: r.legacy,
      });
      sessionIdByPty.set(r.ptyId, r.sessionId);
    }
  }
}

export function getBrokerStatus(): BrokerStatus {
  return brokerClient ? brokerClient.getStatus() : { mode: 'inproc', reason: 'uninitialized' };
}

export async function createPty(options: {
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
  agentId?: string | undefined;
  initialInput?: string | undefined;
}): Promise<CreateResult> {
  if (brokerClient && brokerClient.getStatus().mode === 'broker' && brokerClient.isAlive()) {
    const result = await brokerClient.createPty({
      ...options,
      env: {
        ...process.env,
        TERM_PROGRAM: 'midnite-studio',
        GIT_TERMINAL_PROMPT: '1',
      } as Record<string, string>,
    });

    if (result.ok) {
      sessions.set(result.ptyId, {
        ptyId: result.ptyId,
        sessionId: options.sessionId,
        pid: result.pid,
        cols: options.cols,
        rows: options.rows,
        // A pty this call just created is always on the primary — `createPty`
        // has no legacy-peer branch (see `broker-client.ts`'s own `createPty`).
        legacy: false,
      });
      sessionIdByPty.set(result.ptyId, options.sessionId);
      agentWatcher?.track(result.ptyId, result.pid, options.agentId ?? null);
      return { ok: true, ptyId: result.ptyId };
    }
    return { ok: false, message: result.message };
  }

  // Fallback to inproc
  const inprocRes = inprocCreatePty(
    options,
    (ptyId, bytes) => {
      noteActivity(ptyId, bytes);
      ptyDataListeners.get(ptyId)?.(bytes);
      for (const win of subscribersFor(ptyId)) {
        win.webContents.send(EVENT_CHANNELS.ptyData, { ptyId, data: bytes });
      }
    },
    (ptyId, exitCode, signal) => {
      // The inproc path has the sessionId in scope — no map lookup to race.
      notifySessionExit(options.sessionId, exitCode);
      disposeActivity(ptyId);
      ptyExitListeners.get(ptyId)?.(exitCode, signal);
      offPty(ptyId);
      for (const win of subscribersFor(ptyId)) {
        win.webContents.send(EVENT_CHANNELS.ptyExit, {
          ptyId,
          exitCode,
          ...(signal === undefined ? {} : { signal }),
        });
      }
      dropPtySubscribers(ptyId);
    },
  );

  return inprocRes;
}

export function writePty(ptyId: string, data: string): void {
  if (brokerClient && brokerClient.getStatus().mode === 'broker' && brokerClient.isAlive()) {
    brokerClient.writePty(ptyId, data);
  } else {
    inprocWritePty(ptyId, data);
  }
}

export function resizePty(ptyId: string, cols: number, rows: number): void {
  const session = sessions.get(ptyId);
  if (session) {
    session.cols = Math.max(1, cols);
    session.rows = Math.max(1, rows);
  }
  if (brokerClient && brokerClient.getStatus().mode === 'broker' && brokerClient.isAlive()) {
    void brokerClient.resizePty(ptyId, cols, rows);
  } else {
    inprocResizePty(ptyId, cols, rows);
  }
}

export function sessionIdFor(ptyId: string): string | undefined {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    return sessionIdByPty.get(ptyId);
  }
  return inprocSessionIdFor(ptyId);
}

export function livePtyFor(
  sessionId: string,
): { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    for (const session of sessions.values()) {
      if (session.sessionId === sessionId) {
        return {
          ptyId: session.ptyId,
          pid: session.pid,
          cols: session.cols,
          rows: session.rows,
          legacy: session.legacy,
        };
      }
    }
    return null;
  }
  return inprocLivePtyFor(sessionId);
}

export function killPty(ptyId: string): void {
  sessions.delete(ptyId);
  sessionIdByPty.delete(ptyId);
  agentWatcher?.untrack(ptyId);
  disposeActivity(ptyId);

  if (brokerClient && brokerClient.getStatus().mode === 'broker' && brokerClient.isAlive()) {
    void brokerClient.killPty(ptyId);
  } else {
    inprocKillPty(ptyId);
  }
}

/**
 * Detach from broker on window close / quit without killing backend sessions.
 * In inproc mode, kills pty processes.
 */
export function detachAll(): void {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    void brokerClient.disconnect();
  } else {
    inprocKillAllPtys();
  }
}

export function ptySessionCount(): number {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    return sessions.size;
  }
  return inprocPtySessionCount();
}
