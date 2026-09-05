import {
  closedFromSession,
  type AgentDefinition,
  type ClosedSession,
  type SessionActivity,
  type TerminalSession,
} from '@midnite/studio-shared';

import { createAgentsStore, type AgentsStore } from './agents-store';
import { defaultLogger, formatError } from './log';
import {
  activityFor,
  dropScrollback,
  livePtyFor,
  onSessionExit,
  readScrollback,
  scrollbackSessionIds,
  seedScrollback,
} from './pty-service';
import { nullSessionHistoryStore, type SessionHistoryStore } from './session-history-store';
import {
  nullTerminalStore,
  scrollbackPath,
  trimScrollback,
  type TerminalStore,
} from './terminal-store';

/**
 * The session list, between the IPC handlers and the two stores.
 *
 * Holds the ordered rows in memory so that a reorder or a rename is a cheap
 * array operation, and pushes to disk on a timer rather than per change — a
 * session's metadata is rewritten on every title update, and its scrollback
 * grows on every keystroke.
 *
 * The renderer is not the source of truth here. It sends what changed; this
 * module decides what is written and when, so a renderer crash mid-session
 * still leaves a coherent `terminals.json`.
 */
let store: TerminalStore = nullTerminalStore;
let history: SessionHistoryStore = nullSessionHistoryStore;
let agents: AgentsStore | null = null;
let sessions: TerminalSession[] = [];
let dataDir: string | null = null;

/**
 * The last exit code seen per session, so a close can say *how* it ended.
 *
 * A process exiting does not end a session — the row stays and `sessionPhase()`
 * reports `ended`, which is exactly the window in which you read what it
 * printed. Only `forget` ends it. But by then the exit is long past, so it is
 * recorded here when it happens and read back when the close finally comes.
 *
 * Entries are deleted on close alongside the scrollback, so this cannot outgrow
 * the session list — the append-only-map shape Phase 45 flags.
 */
const lastExit = new Map<string, number>();
let stopExitWatch: (() => void) | null = null;

/** Metadata is small and changes rarely — a short debounce coalesces a burst. */
const SAVE_DEBOUNCE_MS = 1_000;
/**
 * Scrollback is large and changes constantly, so it is flushed on an interval
 * rather than debounced: a debounce on a stream of output that never pauses
 * (a `tail -f`, a dev server) would never actually fire.
 */
const FLUSH_INTERVAL_MS = 15_000;

let saveTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;

export function configureTerminals(
  terminalStore: TerminalStore,
  userDataDir: string,
  historyStore: SessionHistoryStore = nullSessionHistoryStore,
): void {
  store = terminalStore;
  history = historyStore;
  agents = createAgentsStore(userDataDir);
  dataDir = userDataDir;
}

/**
 * Record every session exit, so `forgetTerminal` can tell a crash from a close.
 *
 * `onSessionExit` is a seam `pty-service.ts` added with no consumer; this is
 * its second. Wired after the pty service is up — the hook registry is module
 * state, but the exits it observes only exist once the service exists.
 */
export function watchSessionExits(): void {
  if (stopExitWatch) return;
  stopExitWatch = onSessionExit((sessionId, exitCode) => {
    lastExit.set(sessionId, exitCode);
  });
}

/**
 * Restore every saved session and seed its output buffer.
 *
 * Nothing is spawned. A restored row is a dead terminal showing what it printed
 * last time — the pty appears only when the user asks for one, which is what
 * makes reopening the app with a dozen saved terminals free.
 */
export async function listTerminals(): Promise<
  {
    session: TerminalSession;
    scrollback: Uint8Array;
    live: {
      ptyId: string;
      pid: number;
      cols: number;
      rows: number;
      activity: SessionActivity | null;
    } | null;
    /** Set when the live pty behind this row (if any) is on a legacy broker peer. */
    legacy?: boolean;
  }[]
> {
  if (sessions.length === 0) sessions = await store.load();

  return Promise.all(
    sessions.map(async (session) => {
      const bound = livePtyFor(session.id);
      // The current activity guess rides along so a reloaded renderer can seed
      // its session list — `pty:activity` only ever announces changes.
      const live =
        bound === null
          ? null
          : { ptyId: bound.ptyId, pid: bound.pid, cols: bound.cols, rows: bound.rows, activity: activityFor(bound.ptyId) };
      // `legacy` is a wire-level sibling of `live`, not a field on it
      // (`RestoredTerminalSession`, `schemas.ts`) — `sessionPhase` reads it
      // off the restored session row itself, so a legacy pty still reports
      // `live` (it is a real, running process) but is marked asleep by it.
      const legacy = bound?.legacy === true ? { legacy: true as const } : {};
      // Prefer what this launch has already produced: a revived session's live
      // buffer is a superset of the file it was seeded from.
      const runtime = readScrollback(session.id);
      if (runtime.length > 0) return { session, scrollback: runtime, live, ...legacy };

      const saved = await store.readScrollback(session.id);
      seedScrollback(session.id, saved);
      return { session, scrollback: saved, live, ...legacy };
    }),
  );
}

/** Insert or update one row, keeping its position if it already exists. */
export function saveTerminal(session: TerminalSession): void {
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index === -1) sessions.push(session);
  else sessions[index] = session;
  scheduleSave();
}

/**
 * Why a session ended, as far as the renderer can tell.
 *
 * `'exited'` is deliberately absent: it is main's own reading of what happened,
 * derived from `lastExit`, and the renderer does not reliably know.
 */
export type ForgetIntent = 'closed' | 'superseded';

/**
 * End a session by **archiving** it, not by erasing it.
 *
 * This used to be four lines that threw the transcript away. The order below is
 * the substance of the change:
 *
 * 1. **Flush first.** Scrollback is written on a 15 s interval, so without this
 *    the archive is up to fifteen seconds short — and the last fifteen seconds
 *    of an agent session is the part you close it to read. This is the single
 *    most load-bearing line here.
 * 2. Append the record, handing the archive the live scrollback path to
 *    `rename` in. The bytes move; they are never re-read.
 * 3. Drop the in-memory ring (and the broker's copy) and the exit note.
 * 4. Drop the row and schedule the save, unchanged.
 *
 * Stays `void` — `terminal:forget` is a fire-and-forget `ipcMain.on`, so the
 * renderer has nothing to await. Every failure is caught and logged: an archive
 * that fails must still drop the row, or the `X` button stops working.
 */
export function forgetTerminal(sessionId: string, intent: ForgetIntent = 'closed'): void {
  const session = sessions.find((s) => s.id === sessionId);
  // Take the row out synchronously so the renderer's next `list` cannot race
  // the archive and see a session it just closed.
  sessions = sessions.filter((s) => s.id !== sessionId);
  scheduleSave();

  void archiveSession(session, intent).finally(() => {
    dropScrollback(sessionId);
    lastExit.delete(sessionId);
  });
}

async function archiveSession(
  session: TerminalSession | undefined,
  intent: ForgetIntent,
): Promise<void> {
  if (!session) return;
  try {
    // 1 — flush, the same pair `flushScrollback()` uses.
    const bytes = trimScrollback(readScrollback(session.id));
    if (bytes.length > 0) await store.writeScrollback(session.id, bytes);

    // 2 — archive. `transcriptFrom` is null when nothing was ever written, in
    // which case there is no file to move and the record carries zero bytes.
    const from =
      bytes.length > 0 && dataDir !== null ? scrollbackPath(dataDir, session.id) : null;
    const record: ClosedSession = closedFromSession(session, {
      closedAt: Date.now(),
      exitCode: lastExit.get(session.id) ?? null,
      reason: endingFor(session.id, intent),
      transcriptBytes: bytes.length,
    });
    await history.append(record, from);
  } catch (error) {
    defaultLogger(`terminal: archiving session ${session.id} failed: ${formatError(error)}`);
  }
  try {
    /*
      Whatever is *still* at the live scrollback path after the archive.

      On the happy path the rename already took the file and this is a no-op
      `rm --force`. On a failed archive it collects an orphan no session row
      points at any more — a megabyte that would otherwise sit in `scrollback/`
      until the userData directory is deleted. It can never remove an archived
      transcript, because an archived transcript is not at this path.
    */
    await store.forget(session.id);
  } catch {
    // Already gone, or unlinkable — either way there is nothing to do.
  }
}

/** A superseded close is stated by the caller; everything else is read off the exit. */
function endingFor(sessionId: string, intent: ForgetIntent): ClosedSession['reason'] {
  if (intent === 'superseded') return 'superseded';
  return lastExit.has(sessionId) ? 'exited' : 'closed';
}

/**
 * Apply a user-defined order.
 *
 * Takes the whole id list rather than a moved-from/moved-to pair so it is
 * idempotent, and reconciles against what is actually held: ids the renderer
 * named but we do not have are ignored, and rows it omitted keep their relative
 * order at the end rather than vanishing.
 */
export function reorderTerminals(sessionIds: readonly string[]): void {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const ordered: TerminalSession[] = [];

  for (const id of sessionIds) {
    const session = byId.get(id);
    if (session) {
      ordered.push(session);
      byId.delete(id);
    }
  }
  sessions = [...ordered, ...byId.values()];
  scheduleSave();
}

export async function listAgents(): Promise<AgentDefinition[]> {
  return agents ? agents.load() : [];
}

/** Begin the periodic scrollback flush. Called once, after the window exists. */
export function startTerminalFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushScrollback(), FLUSH_INTERVAL_MS);
  // Don't hold the process open for a timer whose only job is bookkeeping.
  flushTimer.unref?.();
}

/**
 * Write every session's output to disk, trimmed to the cap.
 *
 * Also called synchronously-ish from the shutdown path, which is the flush that
 * actually matters: the interval exists so a crash or a force-quit still leaves
 * something to restore.
 */
export async function flushScrollback(): Promise<void> {
  const known = new Set(sessions.map((s) => s.id));
  await Promise.all(
    scrollbackSessionIds()
      .filter((id) => known.has(id))
      .map((id) => store.writeScrollback(id, trimScrollback(readScrollback(id)))),
  );
}

/** Persist everything and stop the timers. For `before-quit`. */
export async function shutdownTerminals(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await Promise.all([store.save(sessions), flushScrollback()]);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void store.save(sessions);
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** Reset module state. Tests only — the app has exactly one session list. */
export function resetTerminalsForTest(): void {
  sessions = [];
  store = nullTerminalStore;
  history = nullSessionHistoryStore;
  agents = null;
  dataDir = null;
  lastExit.clear();
  stopExitWatch?.();
  stopExitWatch = null;
}

/** Seed the exit note directly. Tests only — the app fills this from the pty. */
export function noteSessionExitForTest(sessionId: string, exitCode: number): void {
  lastExit.set(sessionId, exitCode);
}
