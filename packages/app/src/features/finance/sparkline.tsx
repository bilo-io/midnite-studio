import type { HistoryPoint } from './finance-types';

/**
 * Area chart sparkline for finance assets matching the visual geometry
 * and fill technique of the status bar system monitor sparklines.
 *
 * Uses `currentColor` so the line and translucent fill automatically match
 * the surrounding gain/loss text color (emerald, destructive, rose, etc.).
 */
export function Sparkline({
  points,
  up: _up,
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
  const padTop = 1;
  const usable = Math.max(height - padTop, 1);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = padTop + (1 - (p.c - min) / span) * (usable - 1);
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });

  const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaD = `${lineD} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path d={areaD} fill="currentColor" fillOpacity={0.22} />
      <path
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

