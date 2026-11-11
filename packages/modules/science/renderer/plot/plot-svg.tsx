import type { PlotSamples } from './sample';
import { autoRange } from './sample';
import { niceTicks } from './ticks';

export { niceTicks };

export const PLOT_COLORS = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e'] as const;

const W = 640;
const H = 360;
const LEFT = 48;
const BOTTOM = 32;
const PAD = 8;

export type PlotSvgProps = {
  samples: PlotSamples;
  /** `'auto'` takes the percentile range of the samples. */
  y: 'auto' | { min: number; max: number };
};

/** The SVG path for one series: a new `M` at a `NaN` and at a jump of more than 10 times the visible y-range. */
export function seriesPath(
  xs: readonly number[],
  ys: readonly number[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  yRange: number,
): string {
  let d = '';
  let pen = false;
  let prev = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const y = ys[i]!;
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    if (pen && Math.abs(y - prev) > 10 * yRange) pen = false;
    d += `${pen ? 'L' : 'M'}${sx(xs[i]!).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
    prev = y;
  }
  return d;
}

/** A hand-rolled line plot (Phase 126 Theme E.2): nice-number ticks, 8 % grid, axes at zero, legend underneath. */
export function PlotSvg({ samples, y }: PlotSvgProps) {
  const xMin = samples.xs[0] ?? 0;
  const xMax = samples.xs.at(-1) ?? 1;
  const range = y === 'auto' ? autoRange(samples.series.flatMap((s) => s.ys)) : y;
  const sx = (x: number) => LEFT + ((x - xMin) / (xMax - xMin || 1)) * (W - LEFT - PAD);
  const sy = (v: number) => PAD + (1 - (v - range.min) / (range.max - range.min || 1)) * (H - BOTTOM - PAD);
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(range.min, range.max, 6);
  const span = range.max - range.min;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Plot" className="max-w-full">
        <g stroke="currentColor" strokeOpacity={0.08}>
          {xTicks.map((t) => (
            <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={PAD} y2={H - BOTTOM} />
          ))}
          {yTicks.map((t) => (
            <line key={`gy${t}`} y1={sy(t)} y2={sy(t)} x1={LEFT} x2={W - PAD} />
          ))}
        </g>
        <g stroke="currentColor" strokeOpacity={0.5}>
          {xMin <= 0 && xMax >= 0 ? <line x1={sx(0)} x2={sx(0)} y1={PAD} y2={H - BOTTOM} /> : null}
          {range.min <= 0 && range.max >= 0 ? <line y1={sy(0)} y2={sy(0)} x1={LEFT} x2={W - PAD} /> : null}
        </g>
        <g fontSize={10} fill="currentColor" fillOpacity={0.7}>
          {xTicks.map((t) => (
            <text key={`tx${t}`} x={sx(t)} y={H - BOTTOM + 14} textAnchor="middle">
              {t}
            </text>
          ))}
          {yTicks.map((t) => (
            <text key={`ty${t}`} x={LEFT - 6} y={sy(t) + 3} textAnchor="end">
              {t}
            </text>
          ))}
        </g>
        {samples.series.map((s, i) => (
          <path key={s.label + i} d={seriesPath(samples.xs, s.ys, sx, sy, span)} fill="none" stroke={PLOT_COLORS[i % PLOT_COLORS.length]} strokeWidth={1.5} />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-3 px-2 text-xs">
        {samples.series.map((s, i) => (
          <span key={s.label + i} className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: PLOT_COLORS[i % PLOT_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
