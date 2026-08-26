import { useMemo } from 'react';

import type { RepoStats } from '@midnite/git-shared';

import { calendarColor } from '../calendar-palette';
import { calendarWeeks, type CalendarCell } from '../dashboard-derive';
import { WidgetState } from '../widget-frame';

/**
 * A GitHub-style contribution heatmap.
 *
 * Hand-rolled rather than charted: it is a grid of squares, and every charting
 * abstraction that could draw it would cost more than the twenty lines it takes
 * — the same call `metric-chart.tsx` made in Phase 18.
 *
 * The ramp comes from `calendar-palette.ts`, which explains why it is a data
 * hue in `styles.css` rather than alphas of a theme token.
 */
const LEVELS: readonly CalendarCell['level'][] = [0, 1, 2, 3, 4];

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function CalendarWidget({
  stats,
  loading,
  selectedDay,
  onSelectDay,
}: {
  stats: RepoStats | undefined;
  loading: boolean;
  /** The day the activity feed is scoped to, if any. */
  selectedDay: string | null;
  onSelectDay: (date: string | null) => void;
}) {
  const { weeks, total } = useMemo(
    () => calendarWeeks(stats?.calendar ?? []),
    [stats?.calendar],
  );

  return (
    <WidgetState
      loading={loading}
      empty={weeks.length === 0}
      emptyLabel="No commits in this window yet."
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{total}</span>{' '}
          {total === 1 ? 'commit' : 'commits'}
          {stats?.truncated ? ' (history was truncated — showing what was scanned)' : ''}
        </p>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {/*
            The weekday gutter is aria-hidden: every cell already names its own
            date and count, so reading "Mon Wed Fri" out first would be a
            preamble with no information in it.
          */}
          <div aria-hidden className="flex shrink-0 flex-col gap-[3px] pr-1">
            {WEEKDAY_LABELS.map((label, index) => (
              <span
                key={index}
                className="h-[11px] text-[9px] leading-[11px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>

          {weeks.map((week, index) => (
            <div key={index} className="flex shrink-0 flex-col gap-[3px]">
              {week.map((cell, day) =>
                cell === null ? (
                  <span key={day} className="h-[11px] w-[11px]" />
                ) : (
                  <button
                    key={cell.date}
                    type="button"
                    title={`${cell.date} · ${cell.count} ${cell.count === 1 ? 'commit' : 'commits'}`}
                    aria-label={`${cell.date}, ${cell.count} ${cell.count === 1 ? 'commit' : 'commits'}`}
                    aria-pressed={selectedDay === cell.date}
                    onClick={() => onSelectDay(selectedDay === cell.date ? null : cell.date)}
                    className={`h-[11px] w-[11px] rounded-[2px] transition-shadow ${
                      selectedDay === cell.date ? 'ring-2 ring-primary ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: calendarColor(cell.level) }}
                  />
                ),
              )}
            </div>
          ))}
        </div>

        <div aria-hidden className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {LEVELS.map((level) => (
            <span
              key={level}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ backgroundColor: calendarColor(level) }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </WidgetState>
  );
}
