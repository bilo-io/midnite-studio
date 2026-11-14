import type {
  ChatSummary,
  ClosedSession,
  TerminalSession,
  TerminalSessionKind,
  TerminalSurface,
  UnifiedSessionViewMode,
} from '@midnite/studio-shared';

/** Coarse relative age — lives in the frame now (Phase 113 Theme N); re-exported for this file's importers. */
export { relativeAge } from '@midnite/studio-frame';

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
  agentConversationId?: string;
  /** Phase 95 Theme J — set only for an `agent`/`script` workflow node's session; see `groupSessionsByWorkflowRun`. */
  workflowRunRef?: { workflowId: string; runId: string; nodeId: string };
  /** Runs under a sandbox profile (Phase 121 Theme E) — the lock. */
  confined?: boolean;
  /** Underlying terminal session id when backed by a terminal (Phase 146). */
  terminalId?: string;
  /** Underlying chat id when backed by or linked to a chat (Phase 146). */
  chatId?: string;
  /** Linked chat id from TerminalSession (Phase 146). */
  linkedChatId?: string;
  /** Linked terminal id from ChatSummary (Phase 146). */
  linkedTerminalId?: string;
  /** Preferred unified view mode (Phase 146). */
  preferredView?: UnifiedSessionViewMode;
  /** Last update timestamp when backed by a chat (Phase 146). */
  updatedAt?: number;
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

/** Resolve which surface a live/unified row should display. */
export function resolveManagedActiveView(session: ManagedLiveSession): UnifiedSessionViewMode {
  return session.preferredView ?? (session.terminalId ? 'terminal' : 'chat');
}

/** Match a row by primary id or either half of a linked chat/terminal pair. */
export function matchesSessionId(session: ManagedSession, id: string | null): boolean {
  if (id === null) return false;
  if (session.id === id) return true;
  if (!isClosedManagedSession(session)) {
    return session.chatId === id || session.terminalId === id;
  }
  return false;
}

/**
 * Merge the terminal store's live rows, closed-session history, and (optionally)
 * chat summaries into one unified list (Phase 86 Theme A + Phase 146 Theme D).
 * Linked terminal/chat pairs (`linkedChatId` / `linkedTerminalId`) are deduplicated
 * into a single row so they never appear twice in the sidebar.
 */
export function mergeManagedSessions(
  live: readonly TerminalSession[],
  closed: readonly ClosedSession[],
  chats: readonly ChatSummary[] = [],
): ManagedSession[] {
  const chatById = new Map(chats.map((c) => [c.id, c]));
  const chatByLinkedTerminal = new Map<string, ChatSummary>();
  for (const chat of chats) {
    if (chat.linkedTerminalId) chatByLinkedTerminal.set(chat.linkedTerminalId, chat);
  }
  const consumedChatIds = new Set<string>();

  const liveRows: ManagedSession[] = live.map((session) => {
    const linkedChat =
      (session.linkedChatId ? chatById.get(session.linkedChatId) : undefined) ??
      chatByLinkedTerminal.get(session.id);

    if (linkedChat) {
      consumedChatIds.add(linkedChat.id);
    }

    const preferredView =
      session.preferredView ??
      linkedChat?.preferredView ??
      (session.kind === 'agent' ? 'terminal' : undefined);

    const liveness: 'running' | 'asleep' =
      linkedChat?.running ? 'running' : session.asleep === true ? 'asleep' : 'running';

    return {
      id: session.id,
      terminalId: session.id,
      ...(linkedChat
        ? { chatId: linkedChat.id, linkedChatId: linkedChat.id, linkedTerminalId: session.id }
        : session.linkedChatId
          ? { chatId: session.linkedChatId, linkedChatId: session.linkedChatId }
          : {}),
      kind: session.kind,
      liveness,
      ...(session.agentId !== undefined
        ? { agentId: session.agentId }
        : linkedChat
          ? { agentId: linkedChat.engine }
          : {}),
      ...(session.agentConversationId === undefined ? {} : { agentConversationId: session.agentConversationId }),
      title: session.title || linkedChat?.repoName || 'General',
      ...(session.name !== undefined
        ? { name: session.name }
        : linkedChat
          ? { name: linkedChat.title }
          : {}),
      cwd: session.cwd,
      repoId: session.repoId || linkedChat?.repoId || '__general__',
      createdAt: linkedChat ? Math.min(session.createdAt, linkedChat.createdAt) : session.createdAt,
      ...(linkedChat ? { updatedAt: linkedChat.updatedAt } : {}),
      ...(session.surface === undefined ? {} : { surface: session.surface }),
      ...(session.workflowRunRef === undefined ? {} : { workflowRunRef: session.workflowRunRef }),
      ...(session.confined === true ? { confined: true } : {}),
      ...(preferredView === undefined ? {} : { preferredView }),
    };
  });

  const chatRows: ManagedSession[] = [];
  for (const chat of chats) {
    if (consumedChatIds.has(chat.id)) continue;
    chatRows.push({
      id: chat.id,
      chatId: chat.id,
      ...(chat.linkedTerminalId ? { linkedTerminalId: chat.linkedTerminalId } : {}),
      kind: 'agent',
      liveness: chat.running ? 'running' : 'asleep',
      agentId: chat.engine,
      title: chat.repoName ?? 'General',
      name: chat.title,
      cwd: chat.worktree?.path ?? '',
      repoId: chat.repoId ?? '__general__',
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      preferredView: chat.preferredView ?? 'chat',
    });
  }

  const closedRows: ManagedSession[] = closed.map((record) => ({ ...record, liveness: 'closed' }));

  return [...liveRows, ...chatRows, ...closedRows];
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

/** One workflow run's own terminal accordion group (Phase 95 Theme J). */
export type WorkflowRunSessionGroup = {
  workflowId: string;
  runId: string;
  /** Earliest session's `createdAt` — when this run's first node actually started a pty. */
  startedAt: number;
  sessions: ManagedLiveSession[];
};

/**
 * Only a **live** session ever carries a `workflowRunRef` — `ClosedSession`
 * (the Phase 67 archive) does not, so a session that has already ended and
 * been archived falls back to the ordinary by-repo history the moment it
 * closes. That is an acceptable narrowing, not a bug: this group exists to
 * show a run *in flight* (or just finished, before anyone archives it), not
 * to be a second permanent history view.
 */
function hasWorkflowRunRef(
  session: ManagedSession,
): session is ManagedLiveSession & { workflowRunRef: NonNullable<ManagedLiveSession['workflowRunRef']> } {
  return !isClosedManagedSession(session) && session.workflowRunRef !== undefined;
}

/**
 * Pulls every workflow-node session OUT of `sessions` and into its own
 * per-run group, one group per `{workflowId, runId}` pair — the terminal
 * accordion group Theme J's own checklist asks for, headed by the
 * workflow's icon and name (`sessions-view.tsx` resolves the name; this
 * module has no business reading the workflow store). Groups sort newest
 * run first, sessions within a group keep the store's own live order
 * (`sortGroupRows`, same as a repo group).
 *
 * Callers must filter these sessions OUT of whatever they pass to
 * {@link groupSessionsByRepo} — a workflow-node session's `repoId` is the
 * `WORKFLOW_SESSION_REPO_ID` sentinel, which would otherwise show up as one
 * more (meaningless) repo group.
 */
export function groupSessionsByWorkflowRun(sessions: readonly ManagedSession[]): WorkflowRunSessionGroup[] {
  const byRun = new Map<string, ManagedLiveSession[]>();
  for (const session of sessions) {
    if (!hasWorkflowRunRef(session)) continue;
    const key = `${session.workflowRunRef.workflowId}:${session.workflowRunRef.runId}`;
    const existing = byRun.get(key);
    if (existing) existing.push(session);
    else byRun.set(key, [session]);
  }

  const groups: WorkflowRunSessionGroup[] = [...byRun.values()].map((rows) => {
    const ref = (rows[0] as ManagedLiveSession & { workflowRunRef: NonNullable<ManagedLiveSession['workflowRunRef']> })
      .workflowRunRef;
    return {
      workflowId: ref.workflowId,
      runId: ref.runId,
      startedAt: Math.min(...rows.map((r) => r.createdAt)),
      sessions: sortGroupRows(rows) as ManagedLiveSession[],
    };
  });

  return groups.sort((a, b) => b.startedAt - a.startedAt);
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
