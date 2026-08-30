import type { AgentDefinition, TerminalSession } from '@midnite/studio-shared';

import { createAgentsStore, type AgentsStore } from './agents-store';
import {
  dropScrollback,
  livePtyFor,
  readScrollback,
  scrollbackSessionIds,
  seedScrollback,
} from './pty-service';
import { nullTerminalStore, trimScrollback, type TerminalStore } from './terminal-store';

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
let agents: AgentsStore | null = null;
let sessions: TerminalSession[] = [];

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

export function configureTerminals(terminalStore: TerminalStore, userDataDir: string): void {
  store = terminalStore;
  agents = createAgentsStore(userDataDir);
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
    live: { ptyId: string; pid: number; cols: number; rows: number } | null;
  }[]
> {
  if (sessions.length === 0) sessions = await store.load();

  return Promise.all(
    sessions.map(async (session) => {
      const live = livePtyFor(session.id);
      // Prefer what this launch has already produced: a revived session's live
      // buffer is a superset of the file it was seeded from.
      const runtime = readScrollback(session.id);
      if (runtime.length > 0) return { session, scrollback: runtime, live };

      const saved = await store.readScrollback(session.id);
      seedScrollback(session.id, saved);
      return { session, scrollback: saved, live };
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

export function forgetTerminal(sessionId: string): void {
  sessions = sessions.filter((s) => s.id !== sessionId);
  dropScrollback(sessionId);
  void store.forget(sessionId);
  scheduleSave();
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
  agents = null;
}
