import { useMemo, useState } from 'react';

import type { ClosedSession } from '@midnite/studio-shared';
import { LuFilter, LuHistory, LuRefreshCw, LuTrash2 } from 'react-icons/lu';

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
import { useRefreshSessionHistory, useSessionHistory } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useSessionsStore } from '../../store/sessions-store';
import { agentLabelFor } from '../terminal/terminal-store';
import { useAgents } from '../terminal/use-agents';
import { formatDuration, groupSessionsByRepo, pickInitialClosedSession, relativeAge } from './session-order';
import { SessionListSkeleton } from './sessions-skeletons';
import { TranscriptView } from './transcript-view';

const REASON_OPTIONS: MultiSelectOption[] = [
  { value: 'closed', label: 'Closed' },
  { value: 'exited', label: 'Exited' },
  { value: 'superseded', label: 'Superseded' },
];

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

  const history = useSessionHistory();
  const refresh = useRefreshSessionHistory();
  const { agents } = useAgents();

  const [reasons, setReasons] = useState<ClosedSession['reason'][]>([]);

  const stored = useSessionsStore((s) => s.selectedClosedSessionId);
  const selectClosedSession = useSessionsStore((s) => s.selectClosedSession);

  const all = history.data ?? [];
  // Empty means everyone — the same facet convention every other one in this
  // app obeys (`run-history-list.tsx`).
  const rows = reasons.length === 0 ? all : all.filter((row) => reasons.includes(row.reason));

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
          .then(refresh);
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
          .then(refresh);
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
            {groups.map((group) => (
              <div key={group.repoId}>
                <div className="sticky top-0 z-10 bg-background/95 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                  {group.title}
                </div>
                {group.sessions.map((record) => (
                  <SessionRow
                    key={record.id}
                    record={record}
                    agentLabel={agentLabelFor(record.agentId, agents)}
                    selected={record.id === selectedId}
                    onSelect={() => selectClosedSession(record.id)}
                    onPurge={() => purgeOne(record)}
                  />
                ))}
              </div>
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

function SessionRow({
  record,
  agentLabel,
  selected,
  onSelect,
  onPurge,
}: {
  record: ClosedSession;
  agentLabel: string | undefined;
  selected: boolean;
  onSelect: () => void;
  onPurge: () => void;
}) {
  const label = closedSessionLabel(record, agentLabel);
  const duration = record.closedAt - record.createdAt;
  const AgentIcon = record.kind === 'agent' && record.agentId ? resolveAgentIcon({ id: record.agentId }) : null;

  return (
    <div
      className={`group flex items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <StateDot state={dotStateFor(record)} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {AgentIcon ? <AgentIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
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
