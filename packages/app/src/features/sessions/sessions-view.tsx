import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Collapse } from '@bilo-io/ui';
import type { AgentDefinition, ClosedSession } from '@midnite/studio-shared';
import {
  LuBot,
  LuChevronRight,
  LuFilter,
  LuHistory,
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
import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { useCascadeReveal, useRevealCount } from '../../lib/use-cascade-reveal';
import { useRefreshSessionHistory, useSessionHistory } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useSessionsStore } from '../../store/sessions-store';
import { agentLabelFor } from '../terminal/terminal-store';
import { useAgents } from '../terminal/use-agents';
import {
  formatDuration,
  groupSessionsByRepo,
  pickInitialClosedSession,
  relativeAge,
  type SessionGroup,
} from './session-order';
import { SessionListSkeleton } from './sessions-skeletons';
import { TranscriptView } from './transcript-view';

const REASON_OPTIONS: MultiSelectOption[] = [
  { value: 'closed', label: 'Closed' },
  { value: 'exited', label: 'Exited' },
  { value: 'superseded', label: 'Superseded' },
];

/** Value used to represent non-agent terminal sessions in the provider filter. */
const TERMINAL_PROVIDER_VALUE = '__terminal__';

/** A closed session's own label — never `title`, which is the repo name (fact 4). */
function closedSessionLabel(record: ClosedSession, agentLabel: string | undefined): string {
  return record.name ?? agentLabel ?? (record.kind === 'agent' ? 'Agent Session' : 'Terminal');
}

/**
 * The dot a history row draws — `exited` (a hollow ring, `state-dot.tsx`) for
 * a process that ended on its own, `idle` (the shared fill) for a session
 * that ended because a user or the FAB closed it. The reason facet and the
 * exit-code column already carry the rest of the distinction; the dot is a
 * glance-only summary of the same fact.
 */
function dotStateFor(record: ClosedSession): DotState {
  return record.reason === 'exited' ? 'exited' : 'idle';
}

/**
 * The Sessions view: a history of closed agent/terminal sessions, and one
 * read in full (Phase 67 Themes C, D).
 *
 * `issues-view.tsx`'s layout, deliberately (the phase doc's own structural
 * crib): list left, detail right, split by `useResizable` + `ResizeHandle`.
 * What differs from Issues is the shape of the list — grouped by repo under
 * a sticky header, since history spans every repo in one list rather than
 * following the sidebar's active selection (Theme E's `global: true`).
 *
 * Detachable like every other page (Theme F): `'sessions'` joined
 * `PAGE_WINDOW_ROLES` once this mount was audited against the bar
 * `window.ts` sets for a second live copy — it fetches a list and renders
 * it, seeds nothing, and drives no reveal, unlike `BrowserPane`.
 */
export function SessionsView() {
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

  const [reasons, setReasons] = useState<ClosedSession['reason'][]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
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

  const stored = useSessionsStore((s) => s.selectedClosedSessionId);
  const selectClosedSession = useSessionsStore((s) => s.selectClosedSession);

  const all = useMemo(() => history.data ?? [], [history.data]);

  // Derive distinct provider options present in closed session history
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

  // Filter rows by reasons, providers, and the search query
  const rows = useMemo(() => {
    let filtered = all;
    if (reasons.length > 0) {
      filtered = filtered.filter((row) => reasons.includes(row.reason));
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
        const label = closedSessionLabel(row, agentLabelFor(row.agentId, agents)).toLowerCase();
        return label.includes(needle) || row.title.toLowerCase().includes(needle);
      });
    }
    return filtered;
  }, [all, reasons, selectedProviders, query, agents]);

  // A row purged elsewhere, or evicted on refetch, should drop out of the
  // bulk selection rather than linger as a phantom count.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => all.some((row) => row.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [all]);

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someVisibleSelected = rows.some((row) => selectedIds.has(row.id));
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
        for (const row of rows) next.delete(row.id);
        return next;
      }
      return new Set([...prev, ...rows.map((row) => row.id)]);
    });
  };

  const selectedId = useMemo(() => pickInitialClosedSession(rows, stored), [rows, stored]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const groups = useMemo(() => groupSessionsByRepo(rows), [rows]);

  const purgeOne = (record: ClosedSession) => {
    dialogs.confirm({
      title: `Purge "${closedSessionLabel(record, agentLabelFor(record.agentId, agents))}"?`,
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
      warnings: [`${rows.length} sessions and their transcripts are deleted from disk. This cannot be undone.`],
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
              disabled={all.length === 0}
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
              disabled={rows.length === 0}
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
          <EmptyState
            icon={LuHistory}
            title="No closed sessions"
            body="Sessions you close will be kept here, transcript and all."
          />
        ) : (
          <div role="list" aria-label="Closed sessions" className="min-h-0 flex-1 overflow-auto">
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
                selectClosedSession={selectClosedSession}
                purgeOne={purgeOne}
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
      ) : (
        <TranscriptView sessionId={selected.id} />
      )}
    </div>
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
  selectClosedSession,
  purgeOne,
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
  selectClosedSession: (id: string | null) => void;
  purgeOne: (record: ClosedSession) => void;
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
            onSelect={() => selectClosedSession(record.id)}
            onPurge={() => purgeOne(record)}
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
  checked,
  onToggleChecked,
  cascading,
  cascadeStyle,
}: {
  record: ClosedSession;
  agent: AgentDefinition | undefined;
  agentLabel: string | undefined;
  selected: boolean;
  onSelect: () => void;
  onPurge: () => void;
  checked: boolean;
  onToggleChecked: () => void;
  cascading?: boolean;
  cascadeStyle?: CSSProperties;
}) {
  const label = closedSessionLabel(record, agentLabel);
  const duration = record.closedAt - record.createdAt;
  const AgentIcon =
    record.kind === 'agent'
      ? resolveAgentIcon({ id: record.agentId ?? 'agent', icon: agent?.icon })
      : null;

  return (
    <div
      className={`group flex items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
      } ${cascading ? 'animate-fade-in-up cascade-delay' : ''}`}
      style={cascadeStyle}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleChecked}
        aria-label={checked ? `Deselect ${label}` : `Select ${label}`}
        className="h-3 w-3 shrink-0 accent-primary"
      />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <StateDot state={dotStateFor(record)} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {AgentIcon ? (
          <AgentIcon
            aria-hidden
            className="h-3.5 w-3.5 shrink-0"
            style={agent?.accent ? { color: agent.accent } : undefined}
          />
        ) : null}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDuration(duration)} · {relativeAge(record.closedAt, Date.now())}
        </span>
        {record.exitCode !== null && record.exitCode !== 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-destructive">{record.exitCode}</span>
        ) : null}
      </button>
      <IconButton
        icon={LuTrash2}
        label="Purge session"
        size="sm"
        className="shrink-0 opacity-0 group-hover:opacity-100"
        onClick={onPurge}
      />
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
