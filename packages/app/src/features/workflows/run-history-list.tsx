import type { WorkflowRun, WorkflowRunStatus } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
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
 * A workflow's run history (Theme G) — the `Popover` content behind the
 * canvas toolbar's "History" button. Deliberately not a `panel-stack` drawer:
 * the phase doc's own Decision only offers that primitive here if Phase 42
 * had already landed *and* it was cheap to adopt, and adopting it here would
 * mean solving the same "this view unmounts" persistence problem Councils
 * needed its own history store for — a lot of surface for a run list this
 * small. Plain props in, a callback out.
 */
export function RunHistoryList({
  workflowId,
  onSelectRun,
}: {
  workflowId: string;
  onSelectRun: (runId: string) => void;
}) {
  const runs = useWorkflowRuns(workflowId);
  const rows: WorkflowRun[] = runs.data ?? [];
  const now = Date.now();

  if (rows.length === 0) {
    return (
      <div className="w-72 p-2">
        <EmptyState bodySize="xs" title="No runs yet" body="Hit Run to start this workflow's first run." />
      </div>
    );
  }

  return (
    <div className="max-h-80 w-72 overflow-auto">
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
  );
}
