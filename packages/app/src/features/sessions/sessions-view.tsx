import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Collapse } from '@bilo-io/ui';
import {
  buildResumeCommand,
  DEFAULT_LOOPS,
  type AgentDefinition,
  type ClosedSession,
  type TerminalSession,
} from '@midnite/studio-shared';
import {
  LuActivity,
  LuBot,
  LuChevronRight,
  LuFilter,
  LuPlay,
  LuRefreshCw,
  LuSearch,
  LuTerminal,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { resolveAgentIcon } from '../../components/icons';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { PageDetachMark } from '../../components/page-detach-mark';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { StateDot, type DotState } from '../../components/state-dot';
import { Tooltip } from '../../components/tooltip';
import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { useCascadeReveal, useRevealCount } from '../../lib/use-cascade-reveal';
import { useRefreshSessionHistory, useSessionHistory } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useSessionsStore } from '../../store/sessions-store';
import { closeSessionWithConfirm } from '../terminal/close-session';
import { revealSession } from '../terminal/reveal-session';
import { agentLabelFor, inMainPanel, useTerminalStore, type ConnectionState, type SessionActivity } from '../terminal/terminal-store';
import { startAgent } from '../terminal/start-agent';
import { useAgents } from '../terminal/use-agents';
import { loopIcon } from '../loops/loop-icons';
import { useLoopRuns } from '../loops/use-loop-runs';
import { LiveSessionTerminal } from './live-session-terminal';
import {
  formatDuration,
  groupSessionsByRepo,
  isClosedManagedSession,
  mergeManagedSessions,
  pickInitialClosedSession,
  relativeAge,
  type ManagedLiveSession,
  type ManagedSession,
  type ManagedSessionLiveness,
  type SessionGroup,
} from './session-order';
import { NO_SESSIONS_EMPTY, SessionListSkeleton } from './sessions-skeletons';
import { TranscriptView } from './transcript-view';

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
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const dialogs = useDialogs();

  const list = useResizable({
    size: layout.sessionsListWidth,
    onSize: (value) => setLayout('sessionsListWidth', value),
    initial: DEFAULT_LAYOUT.sessionsListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.sessionsListWidth,
  });

  const groupCascade = useCascadeReveal({ revealKey: 'sessions' });

  const history = useSessionHistory();
  const refresh = useRefreshSessionHistory();
  const { agents } = useAgents();
  const liveSessions = useTerminalStore((s) => s.sessions);
  const loopRuns = useLoopRuns();

  /**
   * `sessionId → loopId` for every session a loop ever launched — the same
   * ledger the FAB tab strip's own icon (`fab-launchers.tsx`) reads off
   * `DEFAULT_LOOPS`, so a row here draws the identical glyph rather than a
   * second, invented "this came from a loop" mark. One run per session
   * (`useLoopSession.start` mints a fresh session id every Start press), so
   * last-write-wins during the `Map` build is never actually a choice.
   */
  const loopIdBySession = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of loopRuns.data) map.set(run.sessionId, run.loopId);
    return map;
  }, [loopRuns.data]);

  /**
   * Kill a live session from the list — the same termination path the
   * terminal panel's own close button uses (`closeSessionWithConfirm`), so
   * the confirm behaviour (only asked when a foreground command is still
   * running) stays the one the user already knows rather than a second rule
   * invented for this surface.
   */
  const killSession = (session: ManagedLiveSession) => {
    const raw = liveSessions.find((s) => s.id === session.id);
    if (raw) closeSessionWithConfirm(dialogs, raw);
  };

  const [reasons, setReasons] = useState<ClosedSession['reason'][]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedLiveness, setSelectedLiveness] = useState<ManagedSessionLiveness[]>([]);
  const [collapsedRepos, setCollapsedRepos] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
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

  const storedClosed = useSessionsStore((s) => s.selectedClosedSessionId);
  const selectClosedSession = useSessionsStore((s) => s.selectClosedSession);
  const storedLive = useSessionsStore((s) => s.selectedLiveSessionId);
  const selectLiveSession = useSessionsStore((s) => s.selectLiveSession);

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
      const Icon = resolveAgentIcon({ id: agentId, icon: agentDef?.icon });
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
  }, [all, agents]);

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

  const groups = useMemo(() => groupSessionsByRepo(rows), [rows]);

  const purgeOne = (record: ClosedSession) => {
    dialogs.confirm({
      title: `Purge "${managedSessionLabel({ ...record, liveness: 'closed' }, agentLabelFor(record.agentId, agents))}"?`,
      confirmLabel: 'Purge',
      danger: true,
      blastRadius: null,
      warnings: ['The transcript is deleted from disk. This cannot be undone.'],
      onConfirm: () => {
        void bridge()
          ?.sessions.purge({ sessionId: record.id })
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
        const client = bridge();
        void Promise.all(ids.map((id) => client?.sessions.purge({ sessionId: id }))).then(() => {
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
        void bridge()
          ?.sessions.purge({ sessionId: null })
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
            <IconButton icon={LuRefreshCw} label="Refresh sessions" size="sm" onClick={refresh} />
            <IconButton
              icon={LuTrash2}
              label="Clear history"
              size="sm"
              disabled={closedAll.length === 0}
              onClick={clearHistory}
            />
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
            <div className="relative min-w-0 flex-1 gradient-border rounded-md">
              <LuSearch
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sessions…"
                aria-label="Search sessions by title or repo"
                className="block h-7 w-full rounded-md border-0 bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear the session search"
                  title="Clear the session search"
                  className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LuX aria-hidden className="h-3 w-3" />
                </button>
              ) : null}
            </div>
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
          <div role="list" aria-label="Sessions" className="min-h-0 flex-1 overflow-auto">
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
              />
            ))}
          </div>
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the sessions list" />

      {selected === null ? (
        <Notice>Select a session to read its transcript.</Notice>
      ) : isClosedManagedSession(selected) ? (
        <TranscriptView sessionId={selected.id} />
      ) : (
        <LiveSessionDetail
          session={selected}
          rawSession={liveSessions.find((s) => s.id === selected.id) ?? null}
        />
      )}
    </div>
  );
}

/**
 * The detail pane's live half (Phase 86 Theme D) — closed rows go through
 * `TranscriptView` above and are untouched.
 *
 * Three shapes, in order of precedence:
 * 1. Asleep — no process to show at all; unchanged from before this theme.
 * 2. Running, but on a surface `revealSession()` cannot show
 *    (`!inMainPanel`, i.e. a FAB loop) — the row says where it lives instead
 *    of silently doing nothing.
 * 3. Running and on the main surface — embeds the real terminal
 *    (`LiveSessionTerminal`), but ONLY while the terminal panel drawer is
 *    fully closed. The drawer unmounts every `TerminalView` it owns the
 *    moment it closes (`app.tsx`'s `terminalTween`), so "closed" is the one
 *    condition that provably guarantees no other live xterm exists for this
 *    session anywhere in the window — the "one xterm per pty" the phase doc
 *    asks for. While the drawer is open, the pane hands off to it instead
 *    of mounting a second one, via the same `revealSession()` a Kanban
 *    card's own `>_` button already uses.
 */
function LiveSessionDetail({
  session,
  rawSession,
}: {
  session: ManagedLiveSession;
  rawSession: TerminalSession | null;
}) {
  const terminalOpen = useUiStore((s) => s.terminalOpen);

  if (session.liveness === 'asleep') {
    return <Notice>This session is asleep — no live process to show. Wake it from the terminal panel.</Notice>;
  }

  if (!rawSession) {
    return <Notice>This session is running — open the terminal panel to interact with it.</Notice>;
  }

  if (!inMainPanel(rawSession)) {
    return (
      <Notice>
        This session is running in the Loops panel, not the terminal panel — open Loops from the
        quick-access menu to interact with it.
      </Notice>
    );
  }

  if (terminalOpen) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <div className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
          <p>This session's terminal is already open in the terminal panel.</p>
          <button
            type="button"
            onClick={() => revealSession(session.id)}
            className="mt-2 text-primary hover:underline"
          >
            Focus it there
          </button>
        </div>
      </div>
    );
  }

  return <LiveSessionTerminal key={rawSession.id} session={rawSession} />;
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
  onKill: (session: ManagedLiveSession) => void;
  onResume?: ((session: ManagedSession) => void) | undefined;
  loopIdBySession: ReadonlyMap<string, string>;
  selectedIds: ReadonlySet<string>;
  toggleSelected: (id: string) => void;
  cascading: boolean;
  groupCascadeStyle?: CSSProperties;
}) {
  const revealCount = useRevealCount(open);
  const sessionCascade = useCascadeReveal({ revealKey: `${group.repoId}:${revealCount}` });

  return (
    <div
      className={`border-b border-border/40 last:border-b-0 ${
        cascading ? 'animate-fade-in-up cascade-delay' : ''
      }`}
      style={groupCascadeStyle}
    >
      <div className="sticky top-0 z-10 flex h-7 items-center bg-background/95 px-2 text-[11px] font-medium text-muted-foreground backdrop-blur">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Collapse ${group.title}` : `Expand ${group.title}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-colors hover:text-foreground"
        >
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className="truncate font-semibold uppercase tracking-wide">
            {group.title}
          </span>
          <span className="tabular-nums text-muted-foreground/70">{group.sessions.length}</span>
        </button>
      </div>
      <Collapse open={open} id={bodyId} aria-label={group.title}>
        {group.sessions.map((record, sessionIndex) => (
          <SessionRow
            key={record.id}
            record={record}
            agent={agents.find((a) => a.id === record.agentId)}
            agentLabel={agentLabelFor(record.agentId, agents)}
            selected={record.id === selectedId}
            onSelect={() => onSelect(record)}
            onPurge={isClosedManagedSession(record) ? () => purgeOne(record) : undefined}
            onKill={isClosedManagedSession(record) ? undefined : () => onKill(record)}
            onResume={onResume ? () => onResume(record) : undefined}
            loopId={loopIdBySession.get(record.id)}
            checked={selectedIds.has(record.id)}
            onToggleChecked={() => toggleSelected(record.id)}
            cascading={sessionCascade.active}
            cascadeStyle={sessionCascade.styleFor(sessionIndex)}
          />
        ))}
      </Collapse>
    </div>
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
}) {
  const connectionState = useTerminalStore((s) => s.states[record.id]);
  const activity = useTerminalStore((s) => s.activity[record.id]);

  const label = managedSessionLabel(record, agentLabel);
  const closed = isClosedManagedSession(record);
  const AgentIcon =
    record.kind === 'agent' && record.agentId
      ? resolveAgentIcon({ id: record.agentId, icon: agent?.icon })
      : LuTerminal;
  const dotState = dotStateFor(record, connectionState);
  const dotTooltip = dotTooltipFor(record, connectionState, activity);

  const loop = loopId ? DEFAULT_LOOPS.find((l) => l.id === loopId) : undefined;
  const LoopIcon = loop ? loopIcon(loop.icon) : null;
  const loopTooltip = loop ? `Started by the ${loop.label} loop` : '';

  const conversationId = record.agentConversationId?.trim();
  const resumeArgs =
    agent && record.kind === 'agent'
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
    if (!agent || !resumeArgs) return;
    startAgent({
      repoId: record.repoId,
      cwd: record.cwd,
      title: record.title,
      agentId: agent.id,
      command: agent.command,
      extraArgs: resumeArgs,
      autoSend: true,
    });
  };

  return (
    <div
      className={`group flex ${SESSION_ROW_HEIGHT_CLASS} items-center gap-2 border-l-2 px-2 text-left text-xs transition-colors ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
      } ${cascading ? 'animate-fade-in-up cascade-delay' : ''}`}
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
            Theme A) — ahead of the text, not after it. */}
        {AgentIcon ? (
          <AgentIcon
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 ${agent?.accent ? '' : 'text-muted-foreground'}`}
            style={agent?.accent ? { color: agent.accent } : undefined}
          />
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

function Notice({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p
        className={`max-w-md text-center text-sm leading-relaxed ${
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {children}
      </p>
    </div>
  );
}
