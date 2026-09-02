import type { CouncilRun, CouncilRunStatus } from '@midnite/studio-shared';
import { LuChevronLeft, LuLoader } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { useCouncilRuns } from './use-council-run';

const STATUS_TONE: Record<CouncilRunStatus, string> = {
  running: 'text-blue-500',
  synthesizing: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-destructive',
};

const STATUS_LABEL: Record<CouncilRunStatus, string> = {
  running: 'Running',
  synthesizing: 'Synthesizing',
  completed: 'Done',
  failed: 'Failed',
};

/**
 * A council's runs, in the left rail (Phase 42 Theme E) — what used to be a
 * horizontal tab strip above `CouncilRunView` is now a vertical list here,
 * sharing the same `panel-stack` history that governs "which council" — so
 * moving between "which council" and "which run of it" is one back/forward
 * motion in one place, the behaviour the feature note asked for.
 */
export function CouncilRunList({
  councilName,
  councilId,
  activeRunId,
  onSelectRun,
  onBack,
}: {
  councilName: string;
  councilId: string;
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  onBack: () => void;
}) {
  const runs = useCouncilRuns(councilId);
  const rows: CouncilRun[] = runs.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1 py-1">
        <IconButton icon={LuChevronLeft} label="Back to councils" size="sm" onClick={onBack} />
        {/*
          Not a heading — the config panel's own `<h2>` already carries the
          council's name as the page's real title, and the breadcrumb above
          already announces it too; a second `heading`-role element with the
          identical accessible name is redundant rather than informative, and
          collided with both in `councils.spec.ts`'s `getByRole('heading')`
          queries once this rail existed.
        */}
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {councilName}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {runs.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Type a prompt on the right and hit Run to start this council's first consultation."
          />
        ) : (
          rows
            .slice()
            .reverse()
            .map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                title={run.prompt}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2 py-2 text-left transition-colors hover:bg-accent ${
                  activeRunId === run.id ? 'bg-accent' : ''
                }`}
              >
                <span className="line-clamp-2 text-xs font-medium text-foreground">{run.prompt}</span>
                <span className={`flex items-center gap-1 text-[11px] ${STATUS_TONE[run.status]}`}>
                  {run.status === 'running' || run.status === 'synthesizing' ? (
                    <LuLoader className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  ) : null}
                  {STATUS_LABEL[run.status]}
                </span>
              </button>
            ))
        )}
      </div>
    </div>
  );
}
