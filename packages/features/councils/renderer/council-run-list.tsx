import { useState } from 'react';
import { LuChevronLeft, LuLoader, LuMessageSquarePlus, LuPlus } from 'react-icons/lu';

import { EmptyState } from '@midnite/studio-frame';
import { councilThreadTitle, councilTurnCount, isCouncilRunLive, type CouncilRun, type CouncilRunStatus } from '@midnite/studio-shared';

import { NewCouncilDialog } from './council-create-dialog';
import { IconButton } from './ui';
import { useCouncilRuns } from './use-council-run';

const STATUS_TONE: Record<CouncilRunStatus, string> = {
  running: 'text-blue-500',
  synthesizing: 'text-blue-500',
  completed: 'text-green-600 dark:text-green-500',
  failed: 'text-destructive',
  timeout: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

/** Every terminal state reads as itself (Phase 133 Theme A) — a timeout is not a failure, a stop is neither. */
export const RUN_STATUS_LABEL: Record<CouncilRunStatus, string> = {
  running: 'Running',
  synthesizing: 'Synthesizing',
  completed: 'Done',
  failed: 'Failed',
  timeout: 'Timed out',
  cancelled: 'Stopped',
};

/**
 * A council's threads, in the left rail (Phase 42 Theme E; Phase 133 Theme E
 * added the turn count, the "+" new-council button and "New thread") — what used to be a
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
  onNewThread,
  onBack,
  onCouncilCreated,
}: {
  councilName: string;
  councilId: string;
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  /** Opens the council with no thread selected, so the composer starts a new one. */
  onNewThread: () => void;
  onBack: () => void;
  onCouncilCreated: (councilId: string) => void;
}) {
  const runs = useCouncilRuns(councilId);
  const rows: CouncilRun[] = runs.data ?? [];
  const [creating, setCreating] = useState(false);

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
        <IconButton icon={LuMessageSquarePlus} label="New thread" size="sm" onClick={onNewThread} />
        <IconButton icon={LuPlus} label="New council" size="sm" onClick={() => setCreating(true)} />
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-auto">
        {runs.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Ask the council in the composer to start its first thread."
          />
        ) : (
          rows
            .slice()
            .reverse()
            .map((run) => {
              const turns = councilTurnCount(run);
              const title = councilThreadTitle(run);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  title={title}
                  data-testid="council-thread-row"
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2 py-2 text-left transition-colors hover:bg-accent ${
                    activeRunId === run.id ? 'bg-accent' : ''
                  }`}
                >
                  <span className="line-clamp-2 text-xs font-medium text-foreground">{title}</span>
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className={`flex items-center gap-1 ${STATUS_TONE[run.status]}`}>
                      {isCouncilRunLive(run.status) ? <LuLoader className="h-2.5 w-2.5 animate-spin" aria-hidden /> : null}
                      {RUN_STATUS_LABEL[run.status]}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="tabular-nums text-muted-foreground">
                      {turns} turn{turns === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              );
            })
        )}
      </div>

      {creating ? (
        <NewCouncilDialog
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onCouncilCreated(id);
          }}
        />
      ) : null}
    </div>
  );
}
