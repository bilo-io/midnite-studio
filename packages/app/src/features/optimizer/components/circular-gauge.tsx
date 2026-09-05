import { ringGeometry } from '../../monitor/metric-path';

/**
 * A percentage as a ring — the Optimizer's own gauge (Phase 59 Theme B),
 * reusing `ringGeometry`'s arithmetic since it is pure maths over a
 * `{size, thickness}` pair and knows nothing about `MetricId`. Unlike
 * `MetricDonut`, this one is not keyed to a metric: it draws the Smart Scan
 * button's progress ring and (a later theme's) memory gauge alike, so its
 * colour is the app's own primary rather than a per-metric hue.
 *
 * `percent` is clamped in both directions before it ever reaches
 * `ringGeometry`, which already refuses to let an out-of-range reading wrap
 * past its own start — the clamp here is what stops the ring from being fed
 * a value the caller never meant literally (a scan racing a delete, a stale
 * read) rather than trusting it silently.
 */
const GEOMETRY = { size: 64, thickness: 0.18, trackAlpha: 0.16 } as const;

export function CircularGauge({
  percent,
  label,
  detail,
}: {
  percent: number;
  label: string;
  detail?: string;
}) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const { centre, radius, stroke, circumference, dash } = ringGeometry(clamped, GEOMETRY);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        role="img"
        aria-label={`${label}: ${Math.round(clamped)}%`}
        viewBox={`0 0 ${GEOMETRY.size} ${GEOMETRY.size}`}
        width={GEOMETRY.size}
        height={GEOMETRY.size}
        className="shrink-0"
      >
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary) / 0.16)"
          strokeWidth={stroke}
        />
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
        <text
          x={centre}
          y={centre}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-[13px] font-semibold tabular-nums"
          aria-hidden
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <div className="text-center">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {detail ? <p className="text-[11px] text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}
