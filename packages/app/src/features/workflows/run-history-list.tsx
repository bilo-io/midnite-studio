import type { WorkflowRun, WorkflowRunStatus } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuFilter } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { useWorkflowRuns } from './use-workflow-run';

const STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_DOT: Record<WorkflowRunStatus, string> = {
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-destructive',
  cancelled: 'bg-muted-foreground',
};

/** Coarse relative age — this list is scanned, not read closely. */
function relativeAge(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * A workflow's run history (Phase 43 Theme G) — the right-hand panel-stack's
 * `'history'` entry content, reached from the canvas toolbar's History
 * button (Phase 52 Theme F; previously a `Popover`, since `panel-stack`
 * would have needed the same "this view unmounts" persistence problem
 * Councils solved with its own module-level history store — not worth it for
 * a run list this small when the answer was "wait for the caller to own a
 * local `usePanelHistory` instead", which `workflows-view.tsx` now does).
 * Carries no width of its own — see `node-inspector.tsx`'s identical note.
 * A status facet (Phase 52 Theme E) narrows it, reusing `MultiSelectMenu`
 * verbatim rather than a second facet control.
 */
export function RunHistoryList({
  workflowId,
  onSelectRun,
}: {
  workflowId: string;
  onSelectRun: (runId: string) => void;
}) {
  const runs = useWorkflowRuns(workflowId);
  const all: WorkflowRun[] = runs.data ?? [];
  const [statuses, setStatuses] = useState<WorkflowRunStatus[]>([]);
  // Empty means everyone — the same facet convention every other one in this
  // app obeys (Phase 52 Theme E).
  const rows = statuses.length === 0 ? all : all.filter((run) => statuses.includes(run.status));
  const now = Date.now();

  if (all.length === 0) {
    return (
      <div className="flex h-full flex-col p-2">
        <EmptyState bodySize="xs" title="No runs yet" body="Hit Run to start this workflow's first run." />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <MultiSelectMenu
          options={STATUS_OPTIONS}
          selected={statuses}
          onChange={(next) => setStatuses(next as WorkflowRunStatus[])}
          icon={<LuFilter aria-hidden className="h-3.5 w-3.5 shrink-0" />}
          allLabel="All statuses"
          searchPlaceholder="Filter status…"
          emptyLabel="No status matches."
          label="Filter runs by status"
          summarise={(n) => `${n} statuses`}
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-2">
          <EmptyState bodySize="xs" title="No matches" body="No run matches this status filter." />
        </div>
      ) : (
        <div role="list" aria-label="Runs" className="min-h-0 flex-1 overflow-auto">
          {rows
            .slice()
            .reverse()
            .map((run) => {
              const duration = run.endedAt !== undefined ? run.endedAt - run.startedAt : null;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  className="flex w-full items-center gap-2 border-b border-border/50 px-2 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-accent"
                >
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[run.status]}`} />
                  <span className="min-w-0 flex-1 truncate">{STATUS_LABEL[run.status]}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {duration !== null ? `${formatDuration(duration)} · ` : ''}
                    {relativeAge(run.startedAt, now)}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];
