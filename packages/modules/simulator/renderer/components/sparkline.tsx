export type SparkSeries = { label: string; color: string; values: number[] };

/**
 * A plain SVG polyline per series on one shared y-scale (Phase 127 Theme E.4). Written here rather than imported
 * from Science's plot component because a module may not import another module. A series with fewer than two
 * values draws nothing.
 */
export function Sparkline({ series, width = 480, height = 96 }: { series: SparkSeries[]; width?: number; height?: number }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const pad = 2;
  const points = (values: number[]) =>
    values
      .map((v, i) => `${(pad + (i / Math.max(1, values.length - 1)) * (width - 2 * pad)).toFixed(1)},${(height - pad - (v / max) * (height - 2 * pad)).toFixed(1)}`)
      .join(' ');
  return (
    <figure className="m-0">
      <svg role="img" aria-label={series.map((s) => s.label).join(' and ') || 'Population'} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {series.map((s) =>
          s.values.length < 2 ? null : <polyline key={s.label} data-series={s.label} fill="none" stroke={s.color} strokeWidth={1.5} points={points(s.values)} />,
        )}
      </svg>
      <figcaption className="flex gap-3 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
            {s.label} {s.values.length > 0 ? s.values[s.values.length - 1] : 0}
          </span>
        ))}
        <span className="ml-auto">peak {max}</span>
      </figcaption>
    </figure>
  );
}
