import { homedir } from 'node:os';
import { basename } from 'node:path';

import {
  closedFromSession,
  type AgentDefinition,
  type ClosedSession,
  type SessionActivity,
  type TerminalSession,
} from '@midnite/studio-shared';

import { createAgentsStore, type AgentsStore } from './agents-store';
import { nullSessionHistoryStore, type SessionHistoryStore } from './session-history-store';
import {
  nullTerminalStore,
  scrollbackPath,
  trimScrollback,
  type TerminalStore,
} from './terminal-store';

/**
 * What the session list needs from outside the feature (Phase 123 Theme E.3): the pty service's ring buffers
 * and exit hook (it reaches `electron`, the window manager and confinement, so it stays in `packages/desktop`),
 * the agent-conversation locator and a log sink. A composer binds them once with {@link setTerminalPorts}.
 */
export type TerminalPtyPort = {
  activityFor(ptyId: string): SessionActivity | null;
  agentIdFor?(ptyId: string): string | null;
  dropScrollback(sessionId: string): void;
  livePtyFor(sessionId: string): { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null;
  /**
   * Every pty the connected brokers hold, primary and legacy alike. Optional so a stub can omit it; without
   * it, a live pty whose row was lost cannot be recovered into the list.
   */
  liveBrokerSessions?(): { sessionId: string; ptyId: string; pid: number; cols: number; rows: number; cwd: string; legacy: boolean; owner?: string | null }[];
  /** Connect to brokers found since boot and take on their ptys — see `recoverDetachedSessions`. */
  rescanBrokerSessions?(): Promise<void>;
  /** End a pty — for `endSessions`, which ends a session without the renderer. */
  killPty?(ptyId: string): void;
  onSessionExit(hook: (sessionId: string, exitCode: number) => void): () => void;
  readScrollback(sessionId: string): Uint8Array;
  scrollbackSessionIds(): string[];
  seedScrollback(sessionId: string, bytes: Uint8Array): void;
};

export type TerminalPorts = {
  pty: TerminalPtyPort;
  locateAgentConversation(
    agentId: string,
    cwd: string,
    fromMs: number,
    toMs: number,
  ): Promise<string | null | undefined>;
  log(message: string): void;
};

let ports: TerminalPorts | null = null;

export function setTerminalPorts(next: TerminalPorts): void {
  ports = next;
}

function port(): TerminalPorts {
  if (!ports) throw new Error('terminal-service: setTerminalPorts() has not been called');
  return ports;
}

const formatError = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error));

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
 * Whether `sessions` has been merged with `terminals.json` yet.
 *
 * The list used to load lazily behind `if (sessions.length === 0)`, while `saveTerminal`, `forgetTerminal`,
 * the debounced save and the quit-time save all wrote `sessions` without loading it first. A launch that
 * never asked for the list (a window that failed to load its renderer, a quit before the first restore) or
 * a save that beat the first `list` rewrote `terminals.json` with only what that launch had touched —
 * every other row gone, with no history entry, while their ptys kept running in the broker with nothing
 * left that named them. Every read and every write now goes through {@link ensureLoaded} first.
 */
let loaded = false;
let loading: Promise<void> | null = null;
/** Rows forgotten before the load landed — the merge must not bring them back from disk. */
const forgottenBeforeLoad = new Set<string>();

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loading ??= (async () => {
    const disk = await store.load();
    // Anything this launch already wrote wins over its saved copy; saved rows it never touched are kept.
    const touched = new Map(sessions.map((s) => [s.id, s]));
    const onDisk = new Set(disk.map((s) => s.id));
    sessions = [
      ...disk.filter((s) => !forgottenBeforeLoad.has(s.id)).map((s) => touched.get(s.id) ?? s),
      ...sessions.filter((s) => !onDisk.has(s.id)),
    ];
    forgottenBeforeLoad.clear();
    loaded = true;
  })().finally(() => {
    loading = null;
  });
  await loading;
}

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

/**
 * Archives still in flight.
 *
 * `terminal:forget` is a one-way `ipcMain.on`, so the archive runs detached
 * from any caller — which means a quit landing between the close and the rename
 * would lose the record. `shutdownTerminals` awaits this set for the same
 * reason it awaits the final `flushScrollback()`: the shutdown flush is the one
 * that actually matters.
 */
const inFlightArchives = new Set<Promise<void>>();

/** Resolve once every in-flight archive has settled. */
export function whenArchivesSettle(): Promise<void> {
  return Promise.allSettled([...inFlightArchives]).then(() => undefined);
}

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
  loaded = false;
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
  stopExitWatch = port().pty.onSessionExit((sessionId, exitCode) => {
    lastExit.set(sessionId, exitCode);
  });
}

/** Ids of every saved or live session — the scrollback retention and "Clear" must never touch (Phase 115 B). */
export async function listSessionIds(): Promise<string[]> {
  await ensureLoaded();
  return sessions.map((s) => s.id);
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
  await ensureLoaded();
  recoverOrphanedPtys();

  return Promise.all(
    sessions.map(async (session) => {
      const bound = port().pty.livePtyFor(session.id);
      const agentId = bound === null ? undefined : port().pty.agentIdFor?.(bound.ptyId);
      // The current activity guess rides along so a reloaded renderer can seed
      // its session list — `pty:activity` only ever announces changes.
      const live =
        bound === null
          ? null
          : {
              ptyId: bound.ptyId,
              pid: bound.pid,
              cols: bound.cols,
              rows: bound.rows,
              activity: port().pty.activityFor(bound.ptyId),
              ...(agentId !== undefined ? { agentId } : {}),
            };
      // `legacy` is a wire-level sibling of `live`, not a field on it
      // (`RestoredTerminalSession`, `schemas.ts`) — `sessionPhase` reads it
      // off the restored session row itself, so a legacy pty still reports
      // `live` (it is a real, running process) but is marked asleep by it.
      const legacy = bound?.legacy === true ? { legacy: true as const } : {};
      // Prefer what this launch has already produced: a revived session's live
      // buffer is a superset of the file it was seeded from.
      const runtime = port().pty.readScrollback(session.id);
      if (runtime.length > 0) return { session, scrollback: runtime, live, ...legacy };

      const saved = await store.readScrollback(session.id);
      port().pty.seedScrollback(session.id, saved);
      return { session, scrollback: saved, live, ...legacy };
    }),
  );
}

/**
 * Give every live broker pty that has no row one, so it lists, reattaches and can be ended.
 *
 * A pty is only ever reached through its row: the renderer binds a pane, a close button and a kill to a
 * session it was told about. A pty whose row is gone — `terminals.json` rewritten without it (see
 * {@link ensureLoaded}), or a row from another build's list — keeps running in its broker, unseen and
 * unkillable. The broker still knows its session id and spawn cwd, which is enough to rebuild a row the
 * user can recognise and end. Saved like any other row so a rename or reorder sticks.
 */
function recoverOrphanedPtys(): DetachedSession[] {
  const live = studioPtys();
  const known = new Set(sessions.map((s) => s.id));
  const recovered: DetachedSession[] = [];
  for (const pty of live) {
    if (known.has(pty.sessionId)) continue;
    known.add(pty.sessionId);
    const row = recoveredSession(pty.sessionId, pty.cwd);
    sessions.push(row);
    recovered.push(detached(row, pty.legacy));
  }
  if (recovered.length > 0) {
    port().log(`[terminal] recovered ${recovered.length} live session(s) that had no saved row`);
    scheduleSave();
  }
  return recovered;
}

/**
 * The broker ptys this list answers for: Studio's own (owner `studio`, or none from a broker that
 * predates owners). A guest app's session lives on the shared broker too, but its row is that app's —
 * recovering it here would duplicate it, and ending it is that app's call.
 */
function studioPtys(): NonNullable<ReturnType<NonNullable<TerminalPtyPort['liveBrokerSessions']>>> {
  return (port().pty.liveBrokerSessions?.() ?? []).filter((p) => !p.owner || p.owner === 'studio');
}

export type DetachedSession = { sessionId: string; title: string; cwd: string; repoId: string; legacy: boolean };

const detached = (row: TerminalSession, legacy: boolean): DetachedSession => ({
  sessionId: row.id,
  title: row.name ?? row.title,
  cwd: row.cwd,
  repoId: row.repoId,
  legacy,
});

/**
 * Full recovery, callable from anywhere (the palette's `terminal.recoverDetached`, and the status-bar
 * widget a later phase adds): connect to every live broker in the broker dir — legacy and retired ones
 * found since boot included — take on their ptys, and give each one without a row a recovered row
 * grouped under its cwd's repo. Resolves with what it recovered plus the live and previous-build totals.
 */
export async function recoverDetachedSessions(): Promise<{
  recovered: DetachedSession[];
  live: number;
  previousBuild: number;
}> {
  await port().pty.rescanBrokerSessions?.();
  await ensureLoaded();
  const recovered = recoverOrphanedPtys();
  const live = studioPtys();
  return { recovered, live: live.length, previousBuild: live.filter((p) => p.legacy).length };
}

/**
 * End sessions without the renderer: kill each one's pty (routed to whichever broker owns it, so a
 * previous-build broker shuts down once its last one goes) and remove its row, archived as closed.
 * Resolves with the ids that existed. The renderer's own close does the same through `pty.kill` and
 * `terminal.forget`; a caller of this re-reads the list afterwards.
 */
export async function endSessions(sessionIds: readonly string[]): Promise<string[]> {
  await ensureLoaded();
  const ended: string[] = [];
  for (const sessionId of new Set(sessionIds)) {
    const pty = port().pty.livePtyFor(sessionId);
    const hasRow = sessions.some((s) => s.id === sessionId);
    if (!pty && !hasRow) continue;
    if (pty) port().pty.killPty?.(pty.ptyId);
    if (hasRow) forgetTerminal(sessionId, 'closed');
    ended.push(sessionId);
  }
  return ended;
}

/** End every session still running in a previous build's broker — see {@link endSessions}. */
export async function endPreviousBuildSessions(): Promise<string[]> {
  const previous = studioPtys()
    .filter((p) => p.legacy)
    .map((p) => p.sessionId);
  return previous.length === 0 ? [] : endSessions(previous);
}

/**
 * The row a recovered pty gets: its spawn cwd (home when the broker had none) and that folder's repo id.
 * A shell row — the agent watcher's live guess still draws the agent's icon, and a guessed roster id
 * would fail `agentIdMatchesKind` if it were wrong.
 */
export function recoveredSession(sessionId: string, cwd: string, now = Date.now()): TerminalSession {
  const folder = cwd.trim() === '' ? homedir() : cwd;
  return {
    id: sessionId,
    kind: 'shell',
    title: basename(folder) || folder,
    cwd: folder,
    repoId: `repo:${folder}`,
    createdAt: now,
  };
}

/** Persisted `agentId` for `sessionId` (or `null` when plain shell / unknown), for seeding `agentWatcher.track`. */
export async function declaredAgentIdFor(sessionId: string): Promise<string | null> {
  await ensureLoaded();
  return sessions.find((s) => s.id === sessionId)?.agentId ?? null;
}

/**
 * The agent sessions with a live pty, by pty root pid — what Vanguard's network sensor reads every 10 s
 * (Phase 120 Theme E). `listTerminals` also reads and seeds every scrollback, which a poll must not do;
 * this touches no file once the session list is loaded.
 */
export async function liveAgentSessions(): Promise<
  { sessionId: string; repoId: string; pid: number; title: string }[]
> {
  await ensureLoaded();
  return sessions.flatMap((session) => {
    if (session.kind !== 'agent') return [];
    const live = port().pty.livePtyFor(session.id);
    return live === null
      ? []
      : [{ sessionId: session.id, repoId: session.repoId, pid: live.pid, title: session.name ?? session.title }];
  });
}

/**
 * One agent session's identity, for the spend reading and the per-repo limits (Phase 121 Theme F). A cheap
 * lookup over the loaded session list — it reads no scrollback, so a poll can call it.
 */
export async function agentSessionDetail(
  sessionId: string,
): Promise<{ id: string; agentId: string; title: string; cwd: string; agentConversationId?: string } | null> {
  await ensureLoaded();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || session.kind !== 'agent' || !session.agentId) return null;
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.name ?? session.title,
    cwd: session.cwd,
    ...(session.agentConversationId ? { agentConversationId: session.agentConversationId } : {}),
  };
}

/** Look up a single terminal session without reading scrollback files (Phase 146). */
export async function getTerminal(sessionId: string): Promise<TerminalSession | null> {
  await ensureLoaded();
  return sessions.find((s) => s.id === sessionId) ?? null;
}

/** Insert or update one row, keeping its position if it already exists. */
export function saveTerminal(session: TerminalSession): void {
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index === -1) sessions.push(session);
  else sessions[index] = session;
  scheduleSave();
}

/** Insert or update one row and flush `terminals.json` immediately (Phase 146). */
export async function saveTerminalNow(session: TerminalSession): Promise<void> {
  await ensureLoaded();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index === -1) sessions.push(session);
  else sessions[index] = session;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await store.save(sessions);
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
  if (!loaded) forgottenBeforeLoad.add(sessionId);
  scheduleSave();

  const archive = archiveSession(session, intent).finally(() => {
    port().pty.dropScrollback(sessionId);
    lastExit.delete(sessionId);
    inFlightArchives.delete(archive);
  });
  inFlightArchives.add(archive);
}

async function archiveSession(
  session: TerminalSession | undefined,
  intent: ForgetIntent,
): Promise<void> {
  if (!session) return;
  try {
    // 1 — flush, the same pair `flushScrollback()` uses.
    const bytes = trimScrollback(port().pty.readScrollback(session.id));
    if (bytes.length > 0) await store.writeScrollback(session.id, bytes);

    // 2 — locate conversation id if not already resolved (Phase 86)
    const closedAt = Date.now();
    let conversationId = session.agentConversationId;
    if (!conversationId && session.kind === 'agent' && session.agentId) {
      try {
        conversationId =
          (await port().locateAgentConversation(
            session.agentId,
            session.cwd,
            session.createdAt - 60_000,
            closedAt,
          )) ?? undefined;
      } catch {
        // Best-effort
      }
    }

    // 3 — archive. `transcriptFrom` is null when nothing was ever written, in
    // which case there is no file to move and the record carries zero bytes.
    const from =
      bytes.length > 0 && dataDir !== null ? scrollbackPath(dataDir, session.id) : null;
    const sessionToArchive: TerminalSession = conversationId
      ? { ...session, agentConversationId: conversationId }
      : session;
    const record: ClosedSession = closedFromSession(sessionToArchive, {
      closedAt,
      exitCode: lastExit.get(session.id) ?? null,
      reason: endingFor(session.id, intent),
      transcriptBytes: bytes.length,
    });
    await history.append(record, from);
  } catch (error) {
    port().log(`terminal: archiving session ${session.id} failed: ${formatError(error)}`);
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
    port().pty.scrollbackSessionIds()
      .filter((id) => known.has(id))
      .map((id) => store.writeScrollback(id, trimScrollback(port().pty.readScrollback(id)))),
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
  // The archives first: a session closed a moment before the quit has a record
  // to write, and `store.save` must not race it to `terminals.json`.
  await whenArchivesSettle();
  // Never save a list that was never loaded — that is what used to wipe `terminals.json` on quit.
  await ensureLoaded();
  await Promise.all([store.save(sessions), flushScrollback()]);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void ensureLoaded().then(() => store.save(sessions));
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** Reset module state. Tests only — the app has exactly one session list. */
export function resetTerminalsForTest(): void {
  sessions = [];
  loaded = false;
  loading = null;
  forgottenBeforeLoad.clear();
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

/**
 * Return the agent conversation id for a session (live or closed), attempting
 * to locate it from the agent's on-disk store if not yet captured (Phase 86).
 */
export async function getOrLocateConversationId(sessionId: string): Promise<string | null> {
  // 1 — Check live sessions
  await ensureLoaded();
  const live = sessions.find((s) => s.id === sessionId);
  if (live) {
    if (live.agentConversationId) return live.agentConversationId;
    if (live.kind === 'agent' && live.agentId) {
      const id = await port().locateAgentConversation(
        live.agentId,
        live.cwd,
        live.createdAt - 60_000,
        Date.now(),
      );
      if (id) {
        live.agentConversationId = id;
        scheduleSave();
        return id;
      }
    }
    return null;
  }

  // 2 — Check closed session history
  const closedSessions = await history.list();
  const closed = closedSessions.find((s) => s.id === sessionId);
  if (closed) {
    if (closed.agentConversationId) return closed.agentConversationId;
    if (closed.kind === 'agent' && closed.agentId) {
      const id = await port().locateAgentConversation(
        closed.agentId,
        closed.cwd,
        closed.createdAt - 60_000,
        closed.closedAt,
      );
      if (id) {
        closed.agentConversationId = id;
        await history.update(closed);
        return id;
      }
    }
  }

  return null;
}
