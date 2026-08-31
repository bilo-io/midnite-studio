import type { HistoryPoint } from './finance-types';

// Same vivid, theme-independent gain/loss colours the source app's chart used
// (tailwind green-500 / red-500) so the line stays legible in both themes.
const UP_COLOR = '#22c55e';
const DOWN_COLOR = '#ef4444';

/**
 * A minimal inline 7-day price line — hand-rolled rather than charted, the
 * same call the dashboard's `CalendarWidget` makes for its heatmap: this is a
 * dozen lines of SVG, well under what wiring up a charting library would cost
 * for a sparkline with no axes, tooltip, or interaction.
 */
export function Sparkline({
  points,
  up,
  width = 48,
  height = 24,
}: {
  points: readonly HistoryPoint[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const values = points.map((p) => p.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 1;
  const innerH = Math.max(height - 2 * pad, 1);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - pad - ((p.c - min) / span) * innerH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={up ? UP_COLOR : DOWN_COLOR}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
