import type { ClosedSession } from '@midnite/studio-shared';

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

/** One repo's closed sessions, newest first. */
export type SessionGroup = {
  repoId: string;
  /** The repo name — every row in the group carries the same `title`. */
  title: string;
  sessions: ClosedSession[];
};

/**
 * Group closed sessions by repo, newest-first inside each group, groups
 * themselves ordered by their newest member — so the repo you were last
 * working in sits at the top.
 */
export function groupSessionsByRepo(sessions: readonly ClosedSession[]): SessionGroup[] {
  const byRepo = new Map<string, ClosedSession[]>();
  for (const session of sessions) {
    const existing = byRepo.get(session.repoId);
    if (existing) existing.push(session);
    else byRepo.set(session.repoId, [session]);
  }

  const groups: SessionGroup[] = [...byRepo.entries()].map(([repoId, rows]) => ({
    repoId,
    title: rows[0]?.title ?? repoId,
    sessions: [...rows].sort((a, b) => b.closedAt - a.closedAt),
  }));

  return groups.sort((a, b) => (b.sessions[0]?.closedAt ?? 0) - (a.sessions[0]?.closedAt ?? 0));
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
