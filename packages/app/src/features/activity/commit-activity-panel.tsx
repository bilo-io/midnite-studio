import { useMemo } from 'react';

import type { ActivityTimeframe, CommitActivity } from '../../components/commit-activity-timeline/activity-buckets';
import { CommitActivityTimeline } from '../../components/commit-activity-timeline/commit-activity-timeline';
import { useRepoStats } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * The commit-activity timeline, wired to the stores — the pure chart lives in
 * `components/commit-activity-timeline/` and knows nothing about any of this.
 *
 * Mounted TWICE in `app.tsx`, once per slot, and at most one instance renders:
 * `right` is the vertical panel between the repositories sidebar and the view
 * stack, `bottom` the horizontal strip above the status bar. Two mounts rather
 * than one that teleports, because each slot has different flex siblings and
 * the placement rules (`shrink-0`, fixed cross-size — see the `stackHeight`
 * comment in app.tsx) are the slot's, not the panel's.
 *
 * Data is the stats envelope's `timeline` rows over the 30-day window — the
 * widest timeframe the panel offers — with churn requested, since two of the
 * three drawings read line counts. Null counts ("not measured") render as
 * zero here: the chart falls back to commit-count bars on an all-zero window.
 */
export function CommitActivityPanel({ slot }: { slot: 'right' | 'bottom' }) {
  const open = useUiStore((s) => s.activityTimelineOpen);
  const variant = useUiStore((s) => s.activityTimelineStyle);
  const orientation = useUiStore((s) => s.activityTimelineOrientation);
  const timeframe = useUiStore((s) => s.activityTimeframe);
  const repoId = useUiStore((s) => s.selectedRepoId);

  const placed = open && (slot === 'right') === (orientation === 'vertical');
  const stats = useRepoStats(repoId, '30d', true, placed);

  const commits = useMemo<CommitActivity[]>(
    () =>
      (stats.data?.timeline ?? []).map((row) => ({
        sha: row.sha,
        timestamp: row.at,
        additions: row.additions ?? 0,
        deletions: row.deletions ?? 0,
      })),
    [stats.data?.timeline],
  );

  if (!placed) return null;

  const vertical = slot === 'right';
  return (
    <div
      data-testid="commit-activity-panel"
      className={`flex shrink-0 border-border bg-background ${
        vertical ? 'w-40 flex-col border-r' : 'h-16 flex-row items-stretch border-t'
      }`}
    >
      <div
        className={`flex shrink-0 items-center gap-1 px-2 ${
          vertical ? 'h-8 border-b border-border' : 'flex-col justify-center'
        }`}
      >
        <span className="text-[11px] font-medium text-muted-foreground">Activity</span>
        <TimeframePicker value={timeframe} />
      </div>
      <div className={`min-h-0 min-w-0 flex-1 ${vertical ? 'p-2' : 'py-1.5 pr-2'}`}>
        {commits.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-[11px] text-muted-foreground">
            {repoId ? 'No commits' : 'No repository'}
          </p>
        ) : (
          <CommitActivityTimeline
            commits={commits}
            timeframe={timeframe}
            variant={variant}
            orientation={orientation}
          />
        )}
      </div>
    </div>
  );
}

const TIMEFRAMES: [ActivityTimeframe, string, string][] = [
  ['day', 'D', 'Last 24 hours'],
  ['week', 'W', 'Last 7 days'],
  ['month', 'M', 'Last 30 days'],
];

/** D / W / M, the same field Settings edits — two doors onto one preference. */
function TimeframePicker({ value }: { value: ActivityTimeframe }) {
  return (
    <div role="radiogroup" aria-label="Timeframe" className="flex gap-0.5">
      {TIMEFRAMES.map(([timeframe, label, title]) => (
        <button
          key={timeframe}
          type="button"
          role="radio"
          aria-checked={value === timeframe}
          aria-label={title}
          title={title}
          onClick={() => useUiStore.getState().setActivityTimeframe(timeframe)}
          className={`h-5 w-5 rounded text-[10px] transition-colors ${
            value === timeframe
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
