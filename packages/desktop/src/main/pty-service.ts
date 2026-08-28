import { EVENT_CHANNELS, SCROLLBACK_BYTES, type SessionActivity } from '@midnite/git-shared';
import type { BrowserWindow } from 'electron';

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

/** Wired as `createActivityDetector`'s `onDisabled` from `index.ts`. */
export function notifyActivityDisabled(agentId: string): void {
  for (const [ptyId, entry] of activityTracking) {
    if (entry.agentId !== agentId) continue;
    entry.clock.dispose();
    activityTracking.delete(ptyId);
    emitActivity(ptyId, null);
  }
}

export function disposeActivity(ptyId: string): void {
  activityTracking.get(ptyId)?.clock.dispose();
  activityTracking.delete(ptyId);
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
};

const sessions = new Map<string, SessionInfo>();
const sessionIdByPty = new Map<string, string>();
const scrollbackBySession = new Map<string, Uint8Array>();

// Cache for snapshot queries from broker (200ms TTL)
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

    const win = getWindowThunk();
    if (win && !win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNELS.ptyData, { ptyId, data: bytes });
    }
  });

  brokerClient.onExit((ptyId, exitCode, signal) => {
    sessions.delete(ptyId);
    sessionIdByPty.delete(ptyId);
    agentWatcher?.untrack(ptyId);
    disposeActivity(ptyId);

    const win = getWindowThunk();
    if (win && !win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNELS.ptyExit, {
        ptyId,
        exitCode,
        ...(signal === undefined ? {} : { signal }),
      });
    }
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
        TERM_PROGRAM: 'midnite-git',
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
      const win = getWindowThunk();
      if (win && !win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNELS.ptyData, { ptyId, data: bytes });
      }
    },
    (ptyId, exitCode, signal) => {
      disposeActivity(ptyId);
      const win = getWindowThunk();
      if (win && !win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNELS.ptyExit, {
          ptyId,
          exitCode,
          ...(signal === undefined ? {} : { signal }),
        });
      }
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
): { ptyId: string; pid: number; cols: number; rows: number } | null {
  if (brokerClient && brokerClient.getStatus().mode === 'broker') {
    for (const session of sessions.values()) {
      if (session.sessionId === sessionId) {
        return {
          ptyId: session.ptyId,
          pid: session.pid,
          cols: session.cols,
          rows: session.rows,
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
