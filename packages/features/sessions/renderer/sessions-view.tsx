import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  EmptyState,
  ExplorerGroup,
  ExplorerNotice as Notice,
  ExplorerSearch,
  ResizeHandle,
  StateDot,
  useActivityGlow,
  useFrameChrome,
  useResizable,
  type ActivityGlowSessionInput,
  type DotState,
  type GitMultiSelectOption as MultiSelectOption,
} from '@midnite/studio-frame';
import {
  buildResumeCommand,
  commitsForLiveSession,
  commitsForSession,
  DEFAULT_LOOPS,
  WORKFLOW_SESSION_REPO_ID,
  type AgentDefinition,
  type ClosedSession,
  type Commit,
  type SessionActivity,
} from '@midnite/studio-shared';
import {
  LuActivity,
  LuBot,
  LuExternalLink,
  LuFilter,
  LuOctagonX,
  LuPlay,
  LuRefreshCw,
  LuTerminal,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import {
  useSessionsHost,
  type SessionConnectionState as ConnectionState,
  type SessionsGraphPort,
  type SessionsHistoryPort,
  type SessionsLoopsPort,
} from './host';
import {
  formatDuration,
  groupSessionsByRepo,
  groupSessionsByWorkflowRun,
  isClosedManagedSession,
  mergeManagedSessions,
  pickInitialClosedSession,
  relativeAge,
  type ManagedLiveSession,
  type ManagedSession,
  type ManagedSessionLiveness,
  type SessionGroup,
  type WorkflowRunSessionGroup,
} from './session-order';
import { NO_SESSIONS_EMPTY, SessionListSkeleton } from './sessions-skeletons';

/** The plain answers for a capability an app leaves out — so every hook below is called unconditionally. */
const EMPTY_HISTORY: SessionsHistoryPort['useHistory'] = () => ({ data: [], isPending: false, isError: false, error: null });
const NO_REFRESH = () => undefined;
const NO_COMMITS: readonly Commit[] = [];
const NO_LOOP_RUNS: ReadonlyMap<string, string> = new Map();
const NO_GRAPH: SessionsGraphPort = { useCommits: () => NO_COMMITS, showCommits: () => undefined };
const NO_LOOPS: Pick<SessionsLoopsPort, 'useLoopIdBySession'> = { useLoopIdBySession: () => NO_LOOP_RUNS };
const NO_WORKFLOW_NAMES = () => undefined;
const NO_KILL = () => null;

/** An agent's display label, or `undefined` for a plain terminal or an agent the roster does not know. */
function agentLabelFor(agentId: string | undefined, agents: readonly AgentDefinition[]): string | undefined {
  if (agentId === undefined) return undefined;
  return agents.find((a) => a.id === agentId)?.label;
}

const REASON_OPTIONS: MultiSelectOption[] = [
  { value: 'closed', label: 'Closed' },
  { value: 'exited', label: 'Exited' },
  { value: 'superseded', label: 'Superseded' },
];

const LIVENESS_OPTIONS: MultiSelectOption[] = [
  { value: 'running', label: 'Running' },
  { value: 'asleep', label: 'Asleep' },
  { value: 'closed', label: 'Closed' },
];

/** Value used to represent non-agent terminal sessions in the provider filter. */
const TERMINAL_PROVIDER_VALUE = '__terminal__';

/**
 * The one row height every list item (never a group header) honours —
 * live, asleep, closed, with or without the loop icon or the kill button.
 * Fixed rather than content-driven: a running agent row could otherwise grow
 * taller than a plain closed row just because it renders a resume/kill
 * `IconButton` (`h-6`, opacity-0 until hover) that a plain shell row does not.
 */
const SESSION_ROW_HEIGHT_CLASS = 'h-8';

/** A stable empty `sessions` array for a closed row's `useActivityGlow` call — see `terminal-session-list.tsx`'s identical constant. */
const EMPTY_GLOW_SESSIONS: readonly ActivityGlowSessionInput[] = [];

/** A row's own label — never `title`, which is the repo name (fact 4). */
function managedSessionLabel(record: ManagedSession, agentLabel: string | undefined): string {
  return record.name ?? agentLabel ?? (record.kind === 'agent' ? 'Agent Session' : 'Terminal');
}

/**
 * The dot a row draws.
 *
 * Closed half unchanged from Phase 67 Theme C: `exited` (a hollow ring,
 * `state-dot.tsx`) for a process that ended on its own, `idle` (the shared
 * fill) for a session that ended because a user or the FAB closed it. The
 * live half is new (Phase 86 Theme A): `asleep` for a deliberately-slept
 * session, and for a running one the actual pty connection state — `starting`
 * while the process comes up, `unavailable` if the backend cannot reach it,
 * `open` (the pulsing fill) otherwise. `connectionState` is undefined only
 * before `terminal-store` has heard anything for this session yet, which
 * reads the same as a freshly-opened one.
 */
function dotStateFor(session: ManagedSession, connectionState: ConnectionState | undefined): DotState {
  if (isClosedManagedSession(session)) {
    return session.reason === 'exited' ? 'exited' : 'idle';
  }
  if (session.liveness === 'asleep') return 'asleep';
  if (connectionState === 'starting') return 'starting';
  if (connectionState === 'unavailable') return 'unavailable';
  return 'open';
}

/**
 * The status dot's tooltip text — what a hover or keyboard-focus names,
 * since the dot itself is a colour and a shape. Sources the live half from
 * the already-streamed `SessionActivitySchema` (`use-agent-activity.ts`)
 * rather than re-deriving anything: `activity` is undefined for "live, and
 * the detector has not spoken yet", read here as a plain "Running".
 */
function dotTooltipFor(
  session: ManagedSession,
  connectionState: ConnectionState | undefined,
  activity: SessionActivity | undefined,
): string {
  if (isClosedManagedSession(session)) {
    if (session.reason === 'exited') return 'Exited on its own';
    if (session.reason === 'superseded') return 'Superseded by a newer run';
    return 'Closed';
  }
  if (session.liveness === 'asleep') return 'Asleep — process stopped, transcript kept';
  if (connectionState === 'starting') return 'Starting…';
  if (connectionState === 'unavailable') return 'Unavailable';
  if (activity === 'thinking') return 'Running — thinking';
  if (activity === 'waiting') return 'Running — waiting on you';
  if (activity === 'idle') return 'Running — idle';
  return 'Running';
}

/**
 * The Sessions view: a manager for every terminal/agent session, live or
 * closed, in one list (Phase 86 Theme A) — and a transcript reader for the
 * closed half (Phase 67 Themes C, D).
 *
 * `issues-view.tsx`'s layout, deliberately (the phase doc's own structural
 * crib): list left, detail right, split by `useResizable` + `ResizeHandle`.
 * What differs from Issues is the shape of the list — grouped by repo under
 * a sticky header, since the manager spans every repo in one list rather
 * than following the sidebar's active selection (Theme E's `global: true`).
 *
 * Detachable like every other page (Theme F): `'sessions'` joined
 * `PAGE_WINDOW_ROLES` once this mount was audited against the bar
 * `window.ts` sets for a second live copy — it fetches a list and renders
 * it, seeds nothing, and drives no reveal, unlike `BrowserPane`.
 */
export function SessionsView({
  onResume,
}: {
  onResume?: (session: ManagedSession) => void;
} = {}) {
  const host = useSessionsHost();
  const chrome = useFrameChrome();
  const { IconButton, PageDetachMark } = chrome;
  const dialogs = chrome.useDialogs();
  const MultiSelectMenu = host.MultiSelectMenu;

  // Live sessions come from the app (Studio's terminal store hydrates on this first read, so a user who
  // opens Sessions straight from launch still sees every live one; Coder's are the host broker's).
  const width = host.useListWidth();
  const list = useResizable({
    size: width.size,
    onSize: width.setSize,
    initial: width.initial,
    axis: 'x',
    min: width.min,
    max: width.max,
  });

  const groupCascade = host.useCascadeReveal({ revealKey: 'sessions' });

  const historyPort = host.history;
  const history = (historyPort?.useHistory ?? EMPTY_HISTORY)();
  const refresh = (historyPort?.useRefresh ?? (() => NO_REFRESH))();
  const agents = host.useAgents();
  const liveSessions = host.useLiveSessions();

  /**
   * `sessionId → loopId` for every session a loop ever launched — the same ledger the FAB tab strip's
   * own icon reads off `DEFAULT_LOOPS`, so a row here draws the identical glyph rather than a second,
   * invented "this came from a loop" mark.
   */
  const loopIdBySession = (host.loops ?? NO_LOOPS).useLoopIdBySession();

  const commits = (host.graph ?? NO_GRAPH).useCommits();
  const navigateToGraph = host.graph?.showCommits;

  /**
   * Kill a live session from the list — the app's own termination path (Studio: the terminal panel's
   * close button, `closeSessionWithConfirm`, so the confirm stays the one the user already knows). An app
   * that may not end a session (Coder starts none, so it ends none) answers null and the row has no `X`.
   */
  const kill = (host.useKill ?? NO_KILL)();
  const killSession = kill
    ? (session: ManagedLiveSession) => {
        const raw = liveSessions.find((s) => s.id === session.id);
        if (raw) kill(raw);
      }
    : undefined;

  const [reasons, setReasons] = useState<ClosedSession['reason'][]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedLiveness, setSelectedLiveness] = useState<ManagedSessionLiveness[]>([]);
  const [collapsedRepos, setCollapsedRepos] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedWorkflowRuns, setCollapsedWorkflowRuns] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const toggleWorkflowRunCollapse = (key: string) => {
    setCollapsedWorkflowRuns((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const toggleRepoCollapse = (repoId: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (!next.delete(repoId)) next.add(repoId);
      return next;
    });
  };

  const {
    closedId: storedClosed,
    selectClosed: selectClosedSession,
    liveId: storedLive,
    selectLive: selectLiveSession,
  } = host.useSelection();

  const closedAll = useMemo(() => history.data ?? [], [history.data]);
  const all = useMemo(
    () => mergeManagedSessions(liveSessions, closedAll),
    [liveSessions, closedAll],
  );

  // Derive distinct provider options present across every session, live or closed.
  const providerOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const record of all) {
      const key = record.kind === 'agent' ? (record.agentId ?? 'agent') : TERMINAL_PROVIDER_VALUE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const options: MultiSelectOption[] = [];
    // Sort agent providers alphabetically by label
    const agentIds = [...counts.keys()].filter((k) => k !== TERMINAL_PROVIDER_VALUE);
    agentIds.sort((a, b) => {
      const labelA = agents.find((ag) => ag.id === a)?.label ?? a;
      const labelB = agents.find((ag) => ag.id === b)?.label ?? b;
      return labelA.localeCompare(labelB);
    });

    for (const agentId of agentIds) {
      const agentDef = agents.find((a) => a.id === agentId);
      const label = agentDef?.label ?? agentId;
      const Icon = host.resolveAgentIcon({ id: agentId, icon: agentDef?.icon });
      options.push({
        value: agentId,
        label,
        icon: (
          <Icon
            aria-hidden
            className="h-3.5 w-3.5 shrink-0"
            style={agentDef?.accent ? { color: agentDef.accent } : undefined}
          />
        ),
        meta: <span className="tabular-nums text-[10px] text-muted-foreground">{counts.get(agentId)}</span>,
      });
    }

    if (counts.has(TERMINAL_PROVIDER_VALUE)) {
      options.push({
        value: TERMINAL_PROVIDER_VALUE,
        label: 'Terminal',
        icon: <LuTerminal aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
        meta: (
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {counts.get(TERMINAL_PROVIDER_VALUE)}
          </span>
        ),
      });
    }

    return options;
  }, [all, agents, host]);

  // Filter rows by liveness, reasons, providers, and the search query
  const rows = useMemo(() => {
    let filtered = all;
    if (selectedLiveness.length > 0) {
      filtered = filtered.filter((row) => selectedLiveness.includes(row.liveness));
    }
    if (reasons.length > 0) {
      // `reason` is a closed-only concept — a live/asleep row has none, so
      // the facet narrows the closed half only and never hides a live row.
      filtered = filtered.filter((row) => !isClosedManagedSession(row) || reasons.includes(row.reason));
    }
    if (selectedProviders.length > 0) {
      filtered = filtered.filter((row) => {
        const providerKey = row.kind === 'agent' ? (row.agentId ?? 'agent') : TERMINAL_PROVIDER_VALUE;
        return selectedProviders.includes(providerKey);
      });
    }
    const needle = query.trim().toLowerCase();
    if (needle.length > 0) {
      filtered = filtered.filter((row) => {
        const label = managedSessionLabel(row, agentLabelFor(row.agentId, agents)).toLowerCase();
        return label.includes(needle) || row.title.toLowerCase().includes(needle);
      });
    }
    return filtered;
  }, [all, selectedLiveness, reasons, selectedProviders, query, agents]);

  // Only closed rows carry a purge affordance — a running session offers no
  // purge affordance at all, not a disabled one, so the bulk-select story
  // (checkbox, "N selected", select-all) is scoped to the closed subset too.
  const purgeableRows = useMemo(() => rows.filter(isClosedManagedSession), [rows]);

  // A row purged elsewhere, or evicted on refetch, should drop out of the
  // bulk selection rather than linger as a phantom count.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => closedAll.some((row) => row.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [closedAll]);

  const allVisibleSelected = purgeableRows.length > 0 && purgeableRows.every((row) => selectedIds.has(row.id));
  const someVisibleSelected = purgeableRows.some((row) => selectedIds.has(row.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const row of purgeableRows) next.delete(row.id);
        return next;
      }
      return new Set([...prev, ...purgeableRows.map((row) => row.id)]);
    });
  };

  const closedRows = useMemo(() => rows.filter(isClosedManagedSession), [rows]);
  const selectedClosedId = useMemo(
    () => pickInitialClosedSession(closedRows, storedClosed),
    [closedRows, storedClosed],
  );
  // A stored live id wins while its row is still present in the filtered
  // list — whatever that row's CURRENT liveness is. That is deliberate: a
  // session that transitions running → closed while this view stays
  // mounted keeps the same id (`closedFromSession`), so the pane flips
  // itself from a live placeholder to the transcript with no extra wiring.
  const selectedId = useMemo(() => {
    if (storedLive !== null && rows.some((row) => row.id === storedLive)) return storedLive;
    return selectedClosedId;
  }, [storedLive, rows, selectedClosedId]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const selectRow = (session: ManagedSession) => {
    if (isClosedManagedSession(session)) {
      selectLiveSession(null);
      selectClosedSession(session.id);
    } else {
      selectLiveSession(session.id);
    }
  };

  // Phase 95 Theme J — a workflow node's session is pulled OUT of the
  // ordinary by-repo grouping entirely (its `repoId` is a sentinel,
  // `WORKFLOW_SESSION_REPO_ID`, not a real repo) and grouped by its own run
  // instead, in its own accordion headed by the workflow's icon and name.
  const workflowRunGroups = useMemo(() => groupSessionsByWorkflowRun(rows), [rows]);
  const groups = useMemo(
    () => groupSessionsByRepo(rows.filter((row) => row.repoId !== WORKFLOW_SESSION_REPO_ID)),
    [rows],
  );
  const workflowNames = (host.workflows?.useWorkflowNames ?? NO_WORKFLOW_NAMES)();
  const purge = historyPort?.purge ?? (async () => undefined);

  const purgeOne = (record: ClosedSession) => {
    dialogs.confirm({
      title: `Purge "${managedSessionLabel({ ...record, liveness: 'closed' }, agentLabelFor(record.agentId, agents))}"?`,
      confirmLabel: 'Purge',
      danger: true,
      blastRadius: null,
      warnings: ['The transcript is deleted from disk. This cannot be undone.'],
      onConfirm: () => {
        void purge(record.id)
          .then(() => {
            setSelectedIds((prev) => {
              if (!prev.has(record.id)) return prev;
              const next = new Set(prev);
              next.delete(record.id);
              return next;
            });
            return refresh();
          });
      },
    });
  };

  const purgeMany = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    dialogs.confirm({
      title: `Purge ${ids.length} session${ids.length === 1 ? '' : 's'}?`,
      confirmLabel: 'Purge',
      danger: true,
      blastRadius: null,
      warnings: ['The transcripts are deleted from disk. This cannot be undone.'],
      onConfirm: () => {
        void Promise.all(ids.map((id) => purge(id))).then(() => {
          setSelectedIds(new Set());
          return refresh();
        });
      },
    });
  };

  const clearHistory = () => {
    dialogs.confirm({
      title: 'Clear session history?',
      confirmLabel: 'Clear history',
      danger: true,
      blastRadius: null,
      warnings: [`${closedAll.length} sessions and their transcripts are deleted from disk. This cannot be undone.`],
      onConfirm: () => {
        void purge(null)
          .then(() => {
            setSelectedIds(new Set());
            return refresh();
          });
      },
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
          <PageDetachMark role="sessions" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </h2>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
            {rows.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <MultiSelectMenu
              options={LIVENESS_OPTIONS}
              selected={selectedLiveness}
              onChange={(next) => setSelectedLiveness(next as ManagedSessionLiveness[])}
              icon={<LuActivity aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="All states"
              searchPlaceholder="Filter states…"
              emptyLabel="No state matches."
              label="Filter sessions by liveness"
              summarise={(n) => `${n} states`}
            />
            <MultiSelectMenu
              options={providerOptions}
              selected={selectedProviders}
              onChange={setSelectedProviders}
              icon={<LuBot aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="All providers"
              searchPlaceholder="Filter providers…"
              emptyLabel="No provider matches."
              label="Filter sessions by provider"
              summarise={(n) => `${n} providers`}
            />
            {historyPort ? (
              <MultiSelectMenu
                options={REASON_OPTIONS}
                selected={reasons}
                onChange={(next) => setReasons(next as ClosedSession['reason'][])}
                icon={<LuFilter aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                allLabel="All endings"
                searchPlaceholder="Filter endings…"
                emptyLabel="No ending matches."
                label="Filter sessions by how they ended"
                summarise={(n) => `${n} endings`}
              />
            ) : null}
            {historyPort ? (
              <>
                <IconButton icon={LuRefreshCw} label="Refresh sessions" size="sm" onClick={refresh} />
                <IconButton
                  icon={LuTrash2}
                  label="Clear history"
                  size="sm"
                  disabled={closedAll.length === 0}
                  onClick={clearHistory}
                />
              </>
            ) : null}
          </div>
        </div>

        {all.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={purgeableRows.length === 0}
              aria-label={allVisibleSelected ? 'Deselect all matching sessions' : 'Select all matching sessions'}
              title={allVisibleSelected ? 'Deselect all matching sessions' : 'Select all matching sessions'}
              className="h-3 w-3 shrink-0 accent-primary"
            />
            <ExplorerSearch
              value={query}
              onChange={setQuery}
              placeholder="Search sessions…"
              ariaLabel="Search sessions by title or repo"
              clearLabel="Clear the session search"
            />
          </div>
        ) : null}

        {selectedIds.size > 0 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent/40 px-2 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => purgeMany([...selectedIds])}
              className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <LuTrash2 aria-hidden className="h-3 w-3" />
              Delete {selectedIds.size}
            </button>
          </div>
        ) : null}

        {history.isError ? (
          <Notice tone="destructive">
            {history.error instanceof Error ? history.error.message : String(history.error)}
          </Notice>
        ) : history.isPending ? (
          <SessionListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={NO_SESSIONS_EMPTY.icon} title={NO_SESSIONS_EMPTY.title} body={NO_SESSIONS_EMPTY.body} />
        ) : (
          <div role="list" aria-label="Sessions" className="hide-scrollbar min-h-0 flex-1 overflow-auto">
            {workflowRunGroups.map((group) => {
              const key = `${group.workflowId}:${group.runId}`;
              return (
                <WorkflowRunSessionsGroup
                  key={key}
                  group={group}
                  workflowName={workflowNames?.get(group.workflowId)}
                  open={!collapsedWorkflowRuns.has(key)}
                  bodyId={`sessions-workflow-run-group-${key}`}
                  onToggleCollapse={() => toggleWorkflowRunCollapse(key)}
                  agents={agents}
                  selectedId={selectedId}
                  onSelect={selectRow}
                  onKill={killSession}
                  onResume={onResume}
                  loopIdBySession={loopIdBySession}
                  selectedIds={selectedIds}
                  toggleSelected={toggleSelected}
                  commits={commits}
                  onNavigateToGraph={navigateToGraph}
                />
              );
            })}
            {groups.map((group, groupIndex) => (
              <RepoSessionsGroup
                key={group.repoId}
                group={group}
                groupIndex={groupIndex}
                open={!collapsedRepos.has(group.repoId)}
                bodyId={`sessions-repo-group-${group.repoId}`}
                onToggleCollapse={() => toggleRepoCollapse(group.repoId)}
                agents={agents}
                selectedId={selectedId}
                onSelect={selectRow}
                purgeOne={purgeOne}
                onKill={killSession}
                onResume={onResume}
                loopIdBySession={loopIdBySession}
                selectedIds={selectedIds}
                toggleSelected={toggleSelected}
                cascading={groupCascade.active}
                groupCascadeStyle={groupCascade.styleFor(groupIndex)}
                commits={commits}
                onNavigateToGraph={navigateToGraph}
              />
            ))}
          </div>
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the sessions list" />

      {selected === null ? (
        <Notice>{historyPort ? 'Select a session to read its transcript.' : 'Select a session to attach to it.'}</Notice>
      ) : isClosedManagedSession(selected) ? (
        historyPort ? <historyPort.TranscriptPane sessionId={selected.id} /> : null
      ) : (
        <host.LivePane
          session={selected}
          rawSession={liveSessions.find((s) => s.id === selected.id) ?? null}
        />
      )}
    </div>
  );
}

/**
 * A workflow run's own terminal accordion group (Phase 95 Theme J) — headed
 * by the workflow's icon, name and how long ago its first node started,
 * rather than a repo name, and reusing `SessionRow`/`Collapse` wholesale
 * ("Reuse the Sessions view's accordion… rather than writing a second one",
 * the phase doc's own checklist item — the group header is new, the row
 * rendering is not). Two controls a repo group does not carry: **reveal**
 * (opens the Workflows view straight onto this run's history) and **kill**
 * (opens the five-scope kill switch pre-scoped to Flow for this workflow).
 */
function WorkflowRunSessionsGroup({
  group,
  workflowName,
  open,
  bodyId,
  onToggleCollapse,
  agents,
  selectedId,
  onSelect,
  onKill,
  onResume,
  loopIdBySession,
  selectedIds,
  toggleSelected,
  commits,
  onNavigateToGraph,
}: {
  group: WorkflowRunSessionGroup;
  /** `undefined` while `useWorkflows()` is still loading, or the workflow was since deleted — falls back to a generic label rather than blocking the group on a name. */
  workflowName: string | undefined;
  open: boolean;
  bodyId: string;
  onToggleCollapse: () => void;
  agents: readonly AgentDefinition[];
  selectedId: string | null;
  onSelect: (session: ManagedSession) => void;
  onKill: ((session: ManagedLiveSession) => void) | undefined;
  onResume?: ((session: ManagedSession) => void) | undefined;
  loopIdBySession: ReadonlyMap<string, string>;
  selectedIds: ReadonlySet<string>;
  toggleSelected: (id: string) => void;
  commits?: readonly Commit[] | undefined;
  onNavigateToGraph?: ((session: ManagedSession, sessionCommits: Commit[]) => void) | undefined;
}) {
  const host = useSessionsHost();
  const { IconButton } = useFrameChrome();
  const workflows = host.workflows;
  const title = workflowName ?? 'Workflow';
  const ref = { workflowId: group.workflowId, runId: group.runId };

  // Workflows belong to the Agents app; the host reveals the run (Studio: its Workflows view, through
  // the hand-off seam) rather than this view owning the destination.
  const reveal = (event: React.MouseEvent) => {
    event.stopPropagation();
    workflows?.revealRun(ref);
  };

  const openKillSwitch = workflows?.openKillSwitch;
  const kill = (event: React.MouseEvent) => {
    event.stopPropagation();
    openKillSwitch?.(ref);
  };
  const WorkflowIcon = workflows?.Icon;

  return (
    <ExplorerGroup
      title={title}
      count={group.sessions.length}
      open={open}
      onToggle={onToggleCollapse}
      bodyId={bodyId}
      leading={WorkflowIcon ? <WorkflowIcon className="h-3 w-3 shrink-0" /> : undefined}
      meta={<span className="shrink-0 text-muted-foreground/70">{relativeAge(group.startedAt, Date.now())}</span>}
      trailing={
        <>
          {workflows ? (
            <IconButton icon={LuExternalLink} label="Reveal this run in the Workflows view" size="sm" onClick={reveal} />
          ) : null}
          {openKillSwitch ? (
            <IconButton icon={LuOctagonX} label="Kill switch for this workflow" size="sm" onClick={kill} />
          ) : null}
        </>
      }
    >
        {group.sessions.map((record) => (
          <SessionRow
            key={record.id}
            record={record}
            agent={agents.find((a) => a.id === record.agentId)}
            agentLabel={agentLabelFor(record.agentId, agents)}
            selected={record.id === selectedId}
            onSelect={() => onSelect(record)}
            onPurge={undefined}
            onKill={onKill ? () => onKill(record) : undefined}
            onResume={onResume ? () => onResume(record) : undefined}
            loopId={loopIdBySession.get(record.id)}
            checked={selectedIds.has(record.id)}
            onToggleChecked={() => toggleSelected(record.id)}
            commits={commits}
            onNavigateToGraph={onNavigateToGraph}
          />
        ))}
    </ExplorerGroup>
  );
}

function RepoSessionsGroup({
  group,
  groupIndex: _groupIndex,
  open,
  bodyId,
  onToggleCollapse,
  agents,
  selectedId,
  onSelect,
  purgeOne,
  onKill,
  onResume,
  loopIdBySession,
  selectedIds,
  toggleSelected,
  cascading,
  groupCascadeStyle,
  commits,
  onNavigateToGraph,
}: {
  group: SessionGroup;
  groupIndex: number;
  open: boolean;
  bodyId: string;
  onToggleCollapse: () => void;
  agents: readonly AgentDefinition[];
  selectedId: string | null;
  onSelect: (session: ManagedSession) => void;
  purgeOne: (record: ClosedSession) => void;
  onKill: ((session: ManagedLiveSession) => void) | undefined;
  onResume?: ((session: ManagedSession) => void) | undefined;
  loopIdBySession: ReadonlyMap<string, string>;
  selectedIds: ReadonlySet<string>;
  toggleSelected: (id: string) => void;
  cascading: boolean;
  groupCascadeStyle?: CSSProperties;
  commits?: readonly Commit[] | undefined;
  onNavigateToGraph?: ((session: ManagedSession, sessionCommits: Commit[]) => void) | undefined;
}) {
  const host = useSessionsHost();
  const revealCount = host.useRevealCount(open);
  const sessionCascade = host.useCascadeReveal({ revealKey: `${group.repoId}:${revealCount}` });

  return (
    <ExplorerGroup
      title={group.title}
      count={group.sessions.length}
      open={open}
      onToggle={onToggleCollapse}
      bodyId={bodyId}
      className={cascading ? 'animate-fade-in-up cascade-delay' : ''}
      {...(groupCascadeStyle ? { style: groupCascadeStyle } : {})}
    >
        {group.sessions.map((record, sessionIndex) => (
          <SessionRow
            key={record.id}
            record={record}
            agent={agents.find((a) => a.id === record.agentId)}
            agentLabel={agentLabelFor(record.agentId, agents)}
            selected={record.id === selectedId}
            onSelect={() => onSelect(record)}
            onPurge={isClosedManagedSession(record) ? () => purgeOne(record) : undefined}
            onKill={isClosedManagedSession(record) || !onKill ? undefined : () => onKill(record)}
            onResume={onResume ? () => onResume(record) : undefined}
            loopId={loopIdBySession.get(record.id)}
            checked={selectedIds.has(record.id)}
            onToggleChecked={() => toggleSelected(record.id)}
            cascading={sessionCascade.active}
            cascadeStyle={sessionCascade.styleFor(sessionIndex)}
            commits={commits}
            onNavigateToGraph={onNavigateToGraph}
          />
        ))}
    </ExplorerGroup>
  );
}

function SessionRow({
  record,
  agent,
  agentLabel,
  selected,
  onSelect,
  onPurge,
  onKill,
  onResume,
  loopId,
  checked,
  onToggleChecked,
  cascading,
  cascadeStyle,
  commits,
  onNavigateToGraph,
}: {
  record: ManagedSession;
  agent: AgentDefinition | undefined;
  agentLabel: string | undefined;
  selected: boolean;
  onSelect: () => void;
  /** Absent — not a disabled button — for anything that isn't a closed row. */
  onPurge: (() => void) | undefined;
  /** Absent — not a disabled button — for anything that IS a closed row. */
  onKill: (() => void) | undefined;
  /** Optional override for the resume action (tests, parent delegates). */
  onResume?: (() => void) | undefined;
  /** The loop that launched this session, if any (`sessionId → loopId`). */
  loopId?: string | undefined;
  checked: boolean;
  onToggleChecked: () => void;
  cascading?: boolean;
  cascadeStyle?: CSSProperties;
  commits?: readonly Commit[] | undefined;
  onNavigateToGraph?: ((session: ManagedSession, sessionCommits: Commit[]) => void) | undefined;
}) {
  const host = useSessionsHost();
  const { IconButton } = useFrameChrome();
  const Tooltip = host.Tooltip;
  const { connectionState, activity, agentId: liveAgentId } = host.useLiveStatus(record);

  const label = managedSessionLabel(record, agentLabel);
  const closed = isClosedManagedSession(record);
  // Commit counts need the graph's commits; an app without the graph draws none rather than "0 commits".
  const countsCommits = record.kind === 'agent' && host.graph !== undefined;

  const sessionCommits = useMemo(() => {
    if (!countsCommits) return [];
    const list = commits ?? [];
    if (closed) {
      return commitsForSession(list, record as ClosedSession);
    }
    return commitsForLiveSession(list, record);
  }, [record, closed, commits, countsCommits]);

  const commitCount = countsCommits ? sessionCommits.length : null;

  const [pulsing, setPulsing] = useState(false);
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (commitCount === null) return;
    if (!closed && prevCountRef.current !== null && commitCount > prevCountRef.current) {
      const isReduced =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-motion') === 'reduced';
      if (!isReduced) {
        setPulsing(true);
        const timer = setTimeout(() => setPulsing(false), 800);
        return () => clearTimeout(timer);
      }
    }
    prevCountRef.current = commitCount;
  }, [commitCount, closed]);
  const AgentIcon =
    record.kind === 'agent' && record.agentId
      ? host.resolveAgentIcon({ id: record.agentId, icon: agent?.icon })
      : LuTerminal;
  const dotState = dotStateFor(record, connectionState);
  const dotTooltip = dotTooltipFor(record, connectionState, activity);

  // Phase 95 Theme C — the same ring `terminal-session-list.tsx`'s own
  // `SessionIcon` wears, around this row's identical leading mark. `closed`
  // rows never glow (`isClosedManagedSession`'s own liveness tag), matching
  // `ManagedSession`'s design — a closed row's icon is a plain provenance
  // mark, not something to ring for.
  const rowActivity = useActivityGlow(
    closed
      ? { sessions: EMPTY_GLOW_SESSIONS }
      : {
          sessions: [
            {
              sessionId: record.id,
              agentId: liveAgentId,
              activity,
              running: record.liveness === 'running',
            },
          ],
        },
  );

  const loop = loopId ? DEFAULT_LOOPS.find((l) => l.id === loopId) : undefined;
  const LoopIcon = loop && host.loops ? host.loops.loopIcon(loop.icon) : null;
  const loopTooltip = loop ? `Started by the ${loop.label} loop` : '';

  const conversationId = record.agentConversationId?.trim();
  // Resume starts an agent, so it is offered only where the app may start one (Coder starts nothing).
  const resume = host.resume;
  const resumeArgs =
    agent && record.kind === 'agent' && (resume || onResume)
      ? buildResumeCommand(agent, conversationId)
      : null;

  const resumeTooltip =
    resumeArgs && agent
      ? conversationId
        ? `Resume conversation ${conversationId} (${[agent.command, ...resumeArgs].join(' ')})`
        : `Resume most recent conversation in this directory rather than this session (${[agent.command, ...resumeArgs].join(' ')})`
      : '';

  /**
   * Resume restores a conversation rather than acting on the repository, so it
   * auto-sends — a deliberate exception to `startAgent`'s `autoSend: false` default.
   */
  const handleResume = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onResume) {
      onResume();
      return;
    }
    if (!agent || !resumeArgs || !resume) return;
    resume({ repoId: record.repoId, cwd: record.cwd, title: record.title, agent, args: resumeArgs });
  };

  return (
    <div
      className={`group flex ${SESSION_ROW_HEIGHT_CLASS} items-center gap-2 border-l-2 px-2 text-left text-xs transition-colors ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
      } ${cascading ? 'animate-fade-in-up cascade-delay' : ''} ${
        pulsing ? 'session-row-pulse' : ''
      }`}
      style={cascadeStyle}
    >
      {/* Reserved even when empty, so a live row's label lines up with a
          closed row's — only the closed half is purge-selectable. */}
      <span className="flex h-3 w-3 shrink-0 items-center justify-center">
        {closed ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleChecked}
            aria-label={checked ? `Deselect ${label}` : `Select ${label}`}
            className="h-3 w-3 shrink-0 accent-primary"
          />
        ) : null}
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Tooltip label={dotTooltip}>
          <span
            tabIndex={0}
            aria-label={dotTooltip}
            className="shrink-0 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <StateDot state={dotState} />
          </span>
        </Tooltip>
        {/* The agent icon leads the label rather than trailing it (Phase 86
            Theme A) — ahead of the text, not after it. Wrapped in the
            shared activity glow ring (Phase 95 Theme C) whenever this row
            is live — `terminal-session-list.tsx`'s own `SessionIcon` wears
            the identical ring around the identical leading mark. */}
        {AgentIcon ? (
          rowActivity.status === 'idle' ? (
            <AgentIcon
              aria-hidden
              className={`h-3.5 w-3.5 shrink-0 ${agent?.accent ? '' : 'text-muted-foreground'}`}
              style={agent?.accent ? { color: agent.accent } : undefined}
            />
          ) : (
            <span
              data-activity-status={rowActivity.status}
              data-testid="session-row-icon-glow"
              className="activity-glow flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            >
              <AgentIcon
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 ${agent?.accent ? '' : 'text-muted-foreground'}`}
                style={agent?.accent ? { color: agent.accent } : undefined}
              />
            </span>
          )
        ) : null}
        {/* A second, smaller glyph rather than swapping the provider icon —
            a loop-launched agent session still needs to say which agent. */}
        {LoopIcon ? (
          <Tooltip label={loopTooltip}>
            <span
              tabIndex={0}
              aria-label={loopTooltip}
              className="shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <LoopIcon aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
          </Tooltip>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {closed ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDuration(record.closedAt - record.createdAt)} · {relativeAge(record.closedAt, Date.now())}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            started {relativeAge(record.createdAt, Date.now())}
          </span>
        )}
        {closed && record.exitCode !== null && record.exitCode !== 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-destructive">{record.exitCode}</span>
        ) : null}
      </button>
      {commitCount !== null ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToGraph?.(record, sessionCommits);
          }}
          data-testid="session-commit-count"
          aria-label={`${commitCount} commit${commitCount === 1 ? '' : 's'}`}
          title={`Show ${commitCount} commit${commitCount === 1 ? '' : 's'} in Graph`}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
            pulsing ? 'session-row-pulse ring-1 ring-primary/40 text-primary' : ''
          }`}
        >
          {commitCount} commit{commitCount === 1 ? '' : 's'}
        </button>
      ) : null}
      {resumeArgs ? (
        <IconButton
          icon={LuPlay}
          label={resumeTooltip}
          size="sm"
          className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={handleResume}
        />
      ) : null}
      {onKill ? (
        <IconButton
          icon={LuX}
          label="Kill session"
          size="sm"
          className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onKill();
          }}
        />
      ) : null}
      {onPurge ? (
        <IconButton
          icon={LuTrash2}
          label="Purge session"
          size="sm"
          className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={onPurge}
        />
      ) : null}
    </div>
  );
}

