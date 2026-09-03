import { forwardRef, useMemo, useRef, type KeyboardEventHandler, type ReactNode } from 'react';
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
  const barLayout = useUiStore((s) => s.activityTimelineBarLayout);
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

/** `[value, what the button shows, its accessible name]` — the shape `SegGroup` reads. */
const TIMEFRAMES: readonly (readonly [ActivityTimeframe, ReactNode, string])[] = [
  ['day', 'D', 'Last 24 hours'],
  ['week', 'W', 'Last 7 days'],
  ['month', 'M', 'Last 30 days'],
];

const STYLE_ICONS: readonly (readonly [ActivityTimelineStyle, IconComponent, string])[] = [
  ['bars', LuChartColumn, 'Bars'],
  ['heatmap', LuLayoutGrid, 'Heatmap'],
  ['sparkline', LuChartSpline, 'Sparkline'],
];

const STYLES: readonly (readonly [ActivityTimelineStyle, ReactNode, string])[] = STYLE_ICONS.map(
  ([style, Icon, label]) => [style, <Icon className="h-3 w-3" />, label] as const,
);

/**
 * The 20px square every control in this header is, so the two rows of the
 * horizontal layout line up and the single row of the vertical one is even.
 *
 * Not `IconButton`: that control is 24px with its own tooltip and padding, and
 * three of them plus D/W/M plus the switch would not fit the header at all.
 *
 * `role` is a prop because the header holds both kinds of control — two radio
 * groups and one standalone toggle — and only the sizing is shared.
 */
const Seg = forwardRef<
  HTMLButtonElement,
  {
    role: 'radio' | 'button';
    active: boolean;
    label: string;
    onClick: () => void;
    onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
    children: ReactNode;
    testId?: string;
  }
>(function Seg({ role, active, label, onClick, onKeyDown, children, testId }, ref) {
  const radio = role === 'radio';
  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-checked={radio ? active : undefined}
      aria-pressed={radio ? undefined : active}
      aria-label={label}
      title={label}
      data-testid={testId}
      /*
        An ARIA radio group is ONE tab stop whose members are reached with the
        arrow keys. Without the roving index the six buttons this header gained
        would be six new stops between the graph and everything after it.
      */
      tabIndex={radio && !active ? -1 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] transition-colors ${
        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
});

/**
 * A radio group over one store field, keyboard-navigable the way the ARIA
 * pattern requires: an arrow moves *and* selects, Home/End jump to the ends,
 * and the move wraps — the group is a ring of three, so stopping at the end
 * would just be a dead key. Focus follows the selection, because the selected
 * radio is the only tab stop and an unfocused one cannot receive the next
 * arrow press.
 *
 * Generic over the option union so `StylePicker` and `TimeframePicker` keep
 * their own types rather than meeting at `string`.
 */
function SegGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, ReactNode, string])[];
  onChange: (next: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, event: KeyboardEvent | { key: string }): boolean => {
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : ARROW_STEP[event.key] === undefined
            ? -1
            : (from + ARROW_STEP[event.key]! + options.length) % options.length;
    if (to < 0) return false;
    const next = options[to];
    if (!next) return false;
    onChange(next[0]);
    refs.current[to]?.focus();
    return true;
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5">
      {options.map(([option, content, title], index) => (
        <Seg
          key={option}
          ref={(node) => {
            refs.current[index] = node;
          }}
          role="radio"
          active={value === option}
          label={title}
          onClick={() => onChange(option)}
          onKeyDown={(event) => {
            if (move(index, event)) event.preventDefault();
          }}
        >
          {content}
        </Seg>
      ))}
    </div>
  );
}

/** Both axes: the header runs in a row in one layout and stacks in the other. */
const ARROW_STEP: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** D / W / M, the same field Settings edits — two doors onto one preference. */
function TimeframePicker({ value }: { value: ActivityTimeframe }) {
  return (
    <SegGroup
      label="Timeframe"
      value={value}
      options={TIMEFRAMES}
      onChange={(next) => useUiStore.getState().setActivityTimeframe(next)}
    />
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
    <SegGroup
      label="Chart style"
      value={value}
      options={STYLES}
      onChange={(next) => useUiStore.getState().setActivityTimelineStyle(next)}
    />
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
    <Seg
      role="button"
      active={on}
      label={label}
      testId="activity-gridlines-toggle"
      onClick={() => useUiStore.getState().toggleActivityTimelineGridlines()}
    >
      <LuGrid3X3 className="h-3 w-3" />
    </Seg>
  );
}
