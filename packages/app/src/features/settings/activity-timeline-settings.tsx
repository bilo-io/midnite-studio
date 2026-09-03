import { useUiStore } from '../../store/ui-store';

import { Choice } from './settings-pages/controls';

/**
 * The commit-activity timeline's three axes: what it draws, which way it
 * hangs, and how far back it looks. The timeframe is also editable from the
 * panel's own D/W/M picker — two doors onto the same store field.
 */
export function ActivityTimelineSettings() {
  const style = useUiStore((s) => s.activityTimelineStyle);
  const orientation = useUiStore((s) => s.activityTimelineOrientation);
  const timeframe = useUiStore((s) => s.activityTimeframe);

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
          ['sparkline', 'Sparkline', 'Commit counts as a continuous line'],
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
        ]}
      />
    </div>
  );
}
