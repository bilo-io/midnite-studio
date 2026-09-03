import { useMemo, type ReactNode } from 'react';
import { LuChartColumn, LuChartSpline, LuGrid3X3, LuLayoutGrid } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import {
  GRIDLINE_CADENCE,
  type ActivityTimeframe,
  type CommitActivity,
} from '../../components/commit-activity-timeline/activity-buckets';
import {
  CommitActivityTimeline,
  type ActivityTimelineStyle,
} from '../../components/commit-activity-timeline/commit-activity-timeline';
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
  const gridlines = useUiStore((s) => s.activityTimelineGridlines);
  const barLayout = useUiStore((s) => s.activityBarLayout);
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
        vertical ? 'w-56 flex-col border-r' : 'h-20 flex-row items-stretch border-t'
      }`}
    >
      {/*
        One row of controls when vertical, two when horizontal. Same controls,
        same order, wrapped differently: the vertical panel has 224px of width
        to spend on a single line, the horizontal strip has a narrow column and
        20px of height to spare, so it stacks instead. `w-56` and `h-20` are
        both a step up from the pre-controls panel — the label, three style
        icons, the gridline switch and D/W/M do not fit in what D/W/M alone
        needed, and a wrapping toolbar in a 32px header is worse than a wider one.
      */}
      <div
        className={`flex shrink-0 gap-1 px-2 ${
          vertical
            ? 'h-8 items-center border-b border-border'
            : 'flex-col justify-center border-r border-border py-1'
        }`}
      >
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Activity</span>
          <StylePicker value={variant} />
        </div>
        <div className="flex items-center gap-1">
          <GridlinesToggle on={gridlines} timeframe={timeframe} />
          <TimeframePicker value={timeframe} />
        </div>
      </div>
      <div className={`min-h-0 min-w-0 flex-1 ${vertical ? 'p-2' : 'py-1.5 pr-2'}`}>
        {commits.length > 0 ? (
          <CommitActivityTimeline
            commits={commits}
            timeframe={timeframe}
            variant={variant}
            orientation={orientation}
            gridlines={gridlines}
            barLayout={barLayout}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-center text-[11px] text-muted-foreground">
            {emptyLabel({
              repoId,
              settled: stats.data !== undefined,
              envelope: stats.data,
              timeframe,
            })}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What the empty chart area says, and why it says something specific.
 *
 * "No commits" alone turned out to cover three different situations and lie
 * about two of them: the traversal still running (the first churn walk over a
 * large repository takes seconds), and a dev-mode renderer newer than the
 * Electron main it is talking to (vite reloads the renderer on a pull, but
 * main keeps serving the pre-`timeline` envelope until the app restarts).
 * Only the genuinely-empty window gets the "no commits" answer, and it names
 * the window so switching D/W/M reads as re-asking the question.
 */
export function emptyLabel({
  repoId,
  settled,
  envelope,
  timeframe,
}: {
  repoId: string | null;
  settled: boolean;
  envelope: { timeline?: unknown } | undefined;
  timeframe: ActivityTimeframe;
}): string {
  if (!repoId) return 'No repository';
  if (!settled) return 'Counting commits…';
  // `timeline` is required by the schema, so its absence at runtime means the
  // envelope came from a main process built before the field existed.
  if (envelope && !Array.isArray(envelope.timeline)) return 'Engine updated — restart the app';
  const window =
    timeframe === 'day' ? '24 hours' : timeframe === 'week' ? '7 days' : '30 days';
  return `No commits in the last ${window}`;
}

const TIMEFRAMES: [ActivityTimeframe, string, string][] = [
  ['day', 'D', 'Last 24 hours'],
  ['week', 'W', 'Last 7 days'],
  ['month', 'M', 'Last 30 days'],
];

const STYLES: [ActivityTimelineStyle, IconComponent, string][] = [
  ['bars', LuChartColumn, 'Bars'],
  ['heatmap', LuLayoutGrid, 'Heatmap'],
  ['sparkline', LuChartSpline, 'Sparkline'],
];

/**
 * The 20px square every control in this header is, so the two rows of the
 * horizontal layout line up and the single row of the vertical one is even.
 * Not `IconButton`: that control is 24px with its own tooltip and padding, and
 * three of them plus D/W/M plus the switch would not fit the header at all.
 */
function Seg({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] transition-colors ${
        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}

/** D / W / M, the same field Settings edits — two doors onto one preference. */
function TimeframePicker({ value }: { value: ActivityTimeframe }) {
  return (
    <div role="radiogroup" aria-label="Timeframe" className="flex gap-0.5">
      {TIMEFRAMES.map(([timeframe, label, title]) => (
        <Seg
          key={timeframe}
          active={value === timeframe}
          label={title}
          onClick={() => useUiStore.getState().setActivityTimeframe(timeframe)}
        >
          {label}
        </Seg>
      ))}
    </div>
  );
}

/**
 * The three drawings, as glyphs rather than words — the same store field
 * Settings' own Style choice edits, put where the chart is, so switching is a
 * click beside the thing that changes rather than a trip through a settings
 * page.
 */
function StylePicker({ value }: { value: ActivityTimelineStyle }) {
  return (
    <div role="radiogroup" aria-label="Chart style" className="flex gap-0.5">
      {STYLES.map(([style, Icon, label]) => (
        <Seg
          key={style}
          active={value === style}
          label={label}
          onClick={() => useUiStore.getState().setActivityTimelineStyle(style)}
        >
          <Icon className="h-3 w-3" />
        </Seg>
      ))}
    </div>
  );
}

/**
 * The gridline switch. `aria-pressed`, not a radio — it is one toggle, and its
 * label names the cadence the *current* timeframe will draw at, since "show
 * gridlines" alone does not tell you whether that means 12 rules or 4.
 */
function GridlinesToggle({ on, timeframe }: { on: boolean; timeframe: ActivityTimeframe }) {
  const label = `${on ? 'Hide' : 'Show'} gridlines (${GRIDLINE_CADENCE[timeframe]})`;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      data-testid="activity-gridlines-toggle"
      onClick={() => useUiStore.getState().toggleActivityTimelineGridlines()}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
        on ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      <LuGrid3X3 className="h-3 w-3" />
    </button>
  );
}
