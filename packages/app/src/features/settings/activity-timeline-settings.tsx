import { GRIDLINE_CADENCE } from '../../components/commit-activity-timeline/activity-buckets';
import { useUiStore } from '../../store/ui-store';

import { Choice, Field } from './settings-pages/controls';

/**
 * The commit-activity timeline's settings: what it draws, which way it hangs,
 * how far back it looks, and the three options that only change the drawing —
 * gridlines, and the per-style layouts for the churn bars and the churn areas.
 *
 * Three of these are also editable from the panel's own header (style,
 * gridlines, timeframe) — two doors onto the same store fields, the way the
 * D/W/M/Y picker has always worked.
 */
export function ActivityTimelineSettings() {
  const style = useUiStore((s) => s.activityTimelineStyle);
  const orientation = useUiStore((s) => s.activityTimelineOrientation);
  const timeframe = useUiStore((s) => s.activityTimeframe);
  const gridlines = useUiStore((s) => s.activityTimelineGridlines);
  const barLayout = useUiStore((s) => s.activityTimelineBarLayout);
  const areaLayout = useUiStore((s) => s.activityTimelineAreaLayout);

  return (
    <div className="flex flex-col gap-4">
      <Choice
        label="Style"
        hint="How each time bucket is drawn."
        value={style}
        onChange={(next) => useUiStore.getState().setActivityTimelineStyle(next)}
        options={[
          ['bars', 'Bars', 'Lines added and removed per bucket, split around a centre baseline'],
          ['heatmap', 'Heatmap', 'One cell per bucket, shaded by commit count'],
          ['area', 'Area', 'Lines added and removed as two areas over the window'],
        ]}
      />
      <Choice
        label="Orientation"
        hint="Where the timeline hangs while open."
        value={orientation}
        onChange={(next) => useUiStore.getState().setActivityTimelineOrientation(next)}
        options={[
          ['vertical', 'Vertical', 'A panel to the right of the repositories sidebar'],
          ['horizontal', 'Horizontal', 'A strip directly above the status bar'],
        ]}
      />
      <Choice
        label="Timeframe"
        hint="How far back the timeline looks."
        value={timeframe}
        onChange={(next) => useUiStore.getState().setActivityTimeframe(next)}
        options={[
          ['day', 'Day', 'The last 24 hours, bucketed by hour'],
          ['week', 'Week', 'The last 7 days, bucketed by day'],
          ['month', 'Month', 'The last 30 days, bucketed by day'],
          ['year', 'Year', 'The last 12 calendar months, bucketed by month'],
        ]}
      />
      <Choice
        label="Churn bars"
        hint="How the bars split lines added from lines removed. Only affects the Bars style."
        value={barLayout}
        onChange={(next) => useUiStore.getState().setActivityTimelineBarLayout(next)}
        options={[
          [
            'diverging',
            'Diverging',
            'Additions and deletions grow in opposite directions off a centre baseline',
          ],
          [
            'grouped',
            'Side by side',
            'Two bars per bucket off the same edge, so their lengths compare directly',
          ],
        ]}
      />
      <Choice
        label="Churn areas"
        hint="How the two areas relate. Only affects the Area style."
        value={areaLayout}
        onChange={(next) => useUiStore.getState().setActivityTimelineAreaLayout(next)}
        options={[
          [
            'overlaid',
            'Overlaid',
            'Both areas off the same baseline, so their heights compare directly',
          ],
          [
            'stacked',
            'Stacked',
            'Additions sit on top of deletions, so the outline is total churn',
          ],
        ]}
      />
      <Field
        label="Gridlines"
        hint={`Rules across the time axis, at the current timeframe's cadence — ${GRIDLINE_CADENCE[timeframe]}.`}
      >
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={gridlines}
            onChange={(event) =>
              useUiStore.getState().setActivityTimelineGridlines(event.target.checked)
            }
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
          />
          Show gridlines
        </label>
      </Field>
    </div>
  );
}
