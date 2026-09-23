import type { CSSProperties } from 'react';

import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import type { ForgePull, ForgeRun } from '@midnite/studio-shared';

import { formatNumber } from '../../lib/format-number';
import { useCascadeReveal } from '../../lib/use-cascade-reveal';
import { useActionsStore } from '../../store/actions-store';
import { runStatus, StatusPill } from '../forge/forge-status';
import { findRunPrNumber, getActionItemStyle, RunPrLink } from './action-status-styles';
import { duration, groupRuns, relativeAge } from './run-groups';

/** One shared empty, so an un-customised repo's selector result is stable too. */
const NONE_COLLAPSED: readonly string[] = [];

/**
 * The run list — every run, sectioned under the workflow that produced it.
 *
 * Headers rather than a filter dropdown: the structure is then visible without
 * a control to discover, and it reads in the same idiom as the sidebar's tree.
 * The trade is that strict chronological order is only preserved *within* a
 * workflow, which is the right way round — "how is CI doing" is asked far more
 * often than "what is the single most recent thing that happened".
 */
export function RunList({
  repoId,
  runs,
  selectedRunId,
  now,
  pulls,
}: {
  repoId: string;
  runs: readonly ForgeRun[];
  selectedRunId: string | null;
  /**
   * Passed in rather than read from the clock here.
   *
   * Every row renders a relative age, and a component that called `Date.now()`
   * itself would give the rows in one paint different nows — and would be
   * untestable without faking timers.
   */
  now: number;
  pulls?: readonly ForgePull[] | null;
}) {
  /*
    Select the whole record, index it outside.

    `(s) => s.collapsedWorkflows[repoId] ?? []` builds a NEW array on every
    call, and zustand's `useSyncExternalStore` compares snapshots by identity —
    so it never settles, React reports "The result of getSnapshot should be
    cached to avoid an infinite loop", and the subtree stops rendering. The
    record itself is stable between writes.
  */
  const byRepo = useActionsStore((s) => s.collapsedWorkflows);
  const collapsed = byRepo[repoId] ?? NONE_COLLAPSED;
  const toggleWorkflow = useActionsStore((s) => s.toggleWorkflow);
  const selectRun = useActionsStore((s) => s.selectRun);

  /*
    Theme K.2: this list fully unmounts on a view switch (it does not opt
    into Theme G's keep-alive), so `repoId` alone is enough for `revealKey` —
    the component's own mount already gives "first mount" and "reveal after
    hidden" for free, and `repoId` changing is what covers a repo switch that
    happens without an unmount in between. A run list refresh (a forge poll,
    a query invalidation) changes `runs`, never `repoId`, so it never re-arms.
  */
  const cascade = useCascadeReveal({ revealKey: repoId });

  const groups = groupRuns(runs);
  let row = 0;

  return (
    /*
      Named, because this view has four panes that all render buttons carrying
      run and job names. A landmark per pane is what lets a screen-reader user
      — and a test — say WHICH "CI" they mean.
    */
    <ul aria-label="Workflow runs" className="hide-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
      {groups.map((group) => {
        const open = !collapsed.includes(group.key);
        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => toggleWorkflow(repoId, group.key)}
              aria-expanded={open}
              className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent/30"
            >
              {open ? (
                <LuChevronDown aria-hidden className="h-3 w-3 shrink-0" />
              ) : (
                <LuChevronRight aria-hidden className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{group.label}</span>
              <span className="ml-auto shrink-0 tabular-nums font-normal">
                {formatNumber(group.runs.length)}
              </span>
            </button>

            {open ? (
              <ul>
                {group.runs.map((run) => {
                  row += 1;
                  const prNumber = findRunPrNumber(run, pulls);
                  return (
                    <li key={run.id}>
                      <RunRow
                        run={run}
                        now={now}
                        selected={run.id === selectedRunId}
                        onSelect={() => selectRun(repoId, run.id)}
                        cascading={cascade.active}
                        cascadeStyle={cascade.styleFor(row)}
                        prNumber={prNumber}
                        repoId={repoId}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RunRow({
  run,
  now,
  selected,
  onSelect,
  cascading,
  cascadeStyle,
  prNumber,
  repoId,
}: {
  run: ForgeRun;
  now: number;
  selected: boolean;
  onSelect: () => void;
  cascading: boolean;
  cascadeStyle: CSSProperties;
  prNumber: number | null;
  repoId: string;
}) {
  // Only a completed run has taken anything: `updatedAt` is the last state
  // change, so a running one would show a finished-looking duration.
  const took = run.status === 'completed' ? duration(run.startedAt, run.updatedAt) : null;
  const status = runStatus(run);
  const style = getActionItemStyle(status.tone);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      style={cascadeStyle}
      className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-2 py-1.5 text-left text-[13px] transition-colors ${
        style.rowClass
      } ${cascading ? 'animate-fade-in-up cascade-delay' : ''} ${
        selected ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'
      }`}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <StatusPill status={status} />
        <span className={`truncate font-medium ${style.textClass} ${style.glowClass}`}>
          {run.displayTitle ?? run.name}
        </span>
        {prNumber !== null ? <RunPrLink repoId={repoId} prNumber={prNumber} /> : null}
        {run.number === null ? null : (
          <span
            className={`ml-auto shrink-0 text-[11px] tabular-nums ${style.subtextClass} ${style.glowClass}`}
          >
            #{run.number}
          </span>
        )}
      </span>
      <span
        className={`flex w-full min-w-0 items-center gap-1.5 text-[11px] ${style.subtextClass} ${style.glowClass}`}
      >
        <span className="truncate">{run.headBranch ?? 'detached'}</span>
        {run.event === null ? null : <span className="shrink-0">· {run.event}</span>}
        <span className="ml-auto shrink-0 tabular-nums">
          {took === null
            ? relativeAge(run.createdAt, now)
            : `${took} · ${relativeAge(run.createdAt, now)}`}
        </span>
      </span>
    </button>
  );
}

