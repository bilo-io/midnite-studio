import type { ClosedSession, TerminalSession, TerminalSessionKind, TerminalSurface } from '@midnite/studio-shared';

/**
 * Coarse relative age — copied from `workflows/run-history-list.tsx`, not
 * imported. The phase doc is explicit that the four status-dot/relative-time
 * implementations across this app stay unconsolidated (a genuine tidy, and a
 * different phase); this is the fourth on purpose.
 */
export function relativeAge(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** Also copied from `run-history-list.tsx` — see `relativeAge`'s own note. */
export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * Which lifecycle phase a row in the Sessions manager is in — the one field
 * that discriminates {@link ManagedSession} (Phase 86 Theme A).
 *
 * Derived, never stored twice: a live row is `'asleep'` when
 * `TerminalSession.asleep` is `true`, `'running'` otherwise; a row that came
 * from `useSessionHistory()` is always `'closed'`. Nothing persists this
 * value on its own — it is recomputed by {@link mergeManagedSessions} every
 * time the two source stores change.
 */
export type ManagedSessionLiveness = 'running' | 'asleep' | 'closed';

/** A live or asleep row — the durable-ish fields off `TerminalSession`. */
export type ManagedLiveSession = {
  id: string;
  kind: TerminalSessionKind;
  liveness: 'running' | 'asleep';
  agentId?: string;
  /** The repo name, by default — *not* the session's own label. See `name`. */
  title: string;
  /** The session's own user-set name, when it had one. */
  name?: string;
  cwd: string;
  repoId: string;
  createdAt: number;
  surface?: TerminalSurface;
};

/**
 * A closed row. Reuses {@link ClosedSession} wholesale rather than
 * re-declaring its fields — the only addition is the `liveness` tag every
 * `ManagedSession` carries, and a `ClosedSession` remains assignable
 * anywhere the plain shared type is still expected (purge, the transcript
 * view) since the extra tag is structurally inert there.
 */
export type ManagedClosedSession = ClosedSession & { liveness: 'closed' };

/** One row in the merged Sessions manager list (Phase 86 Theme A). */
export type ManagedSession = ManagedLiveSession | ManagedClosedSession;

export function isClosedManagedSession(session: ManagedSession): session is ManagedClosedSession {
  return session.liveness === 'closed';
}

/**
 * Merge the terminal store's live rows and the closed-session history into
 * one list — the "one list, one truth" a manager needs instead of two
 * surfaces reading two different stores. Live rows come first, in the order
 * `useTerminalStore` already has them (including a manual drag-reorder);
 * closed rows follow, unsorted here — {@link groupSessionsByRepo} does the
 * per-repo ordering both kinds actually need to be shown in.
 */
export function mergeManagedSessions(
  live: readonly TerminalSession[],
  closed: readonly ClosedSession[],
): ManagedSession[] {
  const liveRows: ManagedSession[] = live.map((session) => ({
    id: session.id,
    kind: session.kind,
    liveness: session.asleep === true ? 'asleep' : 'running',
    ...(session.agentId === undefined ? {} : { agentId: session.agentId }),
    title: session.title,
    ...(session.name === undefined ? {} : { name: session.name }),
    cwd: session.cwd,
    repoId: session.repoId,
    createdAt: session.createdAt,
    ...(session.surface === undefined ? {} : { surface: session.surface }),
  }));

  const closedRows: ManagedSession[] = closed.map((record) => ({ ...record, liveness: 'closed' }));

  return [...liveRows, ...closedRows];
}

/** One repo's sessions — live rows above closed, newest first within each. */
export type SessionGroup = {
  repoId: string;
  /** The repo name — every row in the group carries the same `title`. */
  title: string;
  sessions: ManagedSession[];
};

/**
 * Live rows first (their relative order preserved from the merged input —
 * `useTerminalStore`'s own arrangement), then closed rows newest-first — the
 * ordering this function owned before the merge, untouched.
 */
function sortGroupRows(rows: readonly ManagedSession[]): ManagedSession[] {
  const live: ManagedSession[] = [];
  const closed: ManagedClosedSession[] = [];
  for (const row of rows) {
    if (isClosedManagedSession(row)) closed.push(row);
    else live.push(row);
  }
  closed.sort((a, b) => b.closedAt - a.closedAt);
  return [...live, ...closed];
}

/**
 * A group with any live/asleep row at its top outranks one that is entirely
 * closed — "live rows sort above closed" holds at the repo-group level too,
 * not just inside one group. Groups tied on this (two live-topped groups)
 * keep the stable-sort order `Map` iteration handed them, which follows the
 * merged input's own live-first order.
 */
function groupSortKey(group: SessionGroup): number {
  const top = group.sessions[0];
  if (!top) return Number.NEGATIVE_INFINITY;
  return isClosedManagedSession(top) ? top.closedAt : Number.POSITIVE_INFINITY;
}

/**
 * Group sessions by repo, live-above-closed and newest-first inside each
 * group (`sortGroupRows`), groups themselves ordered so a repo with anything
 * live in it sits at the top and the rest fall back to their newest closed
 * member — so the repo you were last working in sits at the top.
 */
export function groupSessionsByRepo(sessions: readonly ManagedSession[]): SessionGroup[] {
  const byRepo = new Map<string, ManagedSession[]>();
  for (const session of sessions) {
    const existing = byRepo.get(session.repoId);
    if (existing) existing.push(session);
    else byRepo.set(session.repoId, [session]);
  }

  const groups: SessionGroup[] = [...byRepo.entries()].map(([repoId, rows]) => ({
    repoId,
    title: rows[0]?.title ?? repoId,
    sessions: sortGroupRows(rows),
  }));

  return groups.sort((a, b) => groupSortKey(b) - groupSortKey(a));
}

/**
 * The session the pane opens on with no explicit selection.
 *
 * The stored id wins, but only while it still exists in the fetched rows —
 * mirroring `pickInitialIssue`'s own reasoning: honouring a selection that
 * aged out of the list would leave the pane empty with no way to tell why.
 * Absent that, the newest row across every repo.
 */
export function pickInitialClosedSession(
  rows: readonly ClosedSession[],
  stored: string | null,
): string | null {
  if (stored !== null && rows.some((row) => row.id === stored)) return stored;
  if (rows.length === 0) return null;
  return rows.reduce((newest, row) => (row.closedAt > newest.closedAt ? row : newest)).id;
}
