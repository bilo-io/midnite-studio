import { useId, useState } from 'react';

import { dayNumber } from '../calc/trends';
import { niceTicks } from './ticks';

export type ChartTone = 'accent' | 'muted' | 'good' | 'bad';
export type ChartSeries = { id: string; label: string; points: { date: string; value: number }[]; kind: 'line' | 'dots' | 'bars'; tone: ChartTone };
export type TimeChartProps = {
  series: ChartSeries[];
  refLine?: { value: number; label: string };
  yUnit: string;
  range: { from: string; to: string };
  title: string;
};

const TONE: Record<ChartTone, string> = { accent: 'var(--accent, #f43f5e)', muted: 'currentColor', good: '#22c55e', bad: '#ef4444' };
const W = 640;
const H = 220;
const PAD = { l: 48, r: 12, t: 12, b: 26 };

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** X tick dates: every Monday for spans up to 45 days, otherwise every first of the month. */
function xTicks(from: string, to: string): string[] {
  const a = dayNumber(from);
  const b = dayNumber(to);
  const out: string[] = [];
  for (let n = a; n <= b; n++) {
    const d = new Date(n * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    if (b - a <= 45 ? d.getUTCDay() === 1 : d.getUTCDate() === 1) out.push(key);
  }
  return out;
}

/**
 * A small time-series chart in one SVG: line, dots and bars, nice y ticks, an optional reference line, a
 * hover rule with a tooltip, and a visually hidden table of the same data for screen readers.
 */
export function TimeChart({ series, refLine, yUnit, range, title }: TimeChartProps) {
  const [hover, setHover] = useState<string | null>(null);
  const id = useId();
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const hasBars = series.some((s) => s.kind === 'bars');
  const lo = Math.min(...all, ...(refLine ? [refLine.value] : []), ...(hasBars ? [0] : []));
  const hi = Math.max(...all, ...(refLine ? [refLine.value] : []));
  const ticks = niceTicks(lo, hi);
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const x0 = dayNumber(range.from);
  const span = Math.max(1, dayNumber(range.to) - x0);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (date: string): number => PAD.l + ((dayNumber(date) - x0) / span) * plotW;
  const y = (v: number): number => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const barW = Math.max(2, (plotW / (span + 1)) * 0.7);

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const at = (s: ChartSeries, date: string) => s.points.find((p) => p.date === date)?.value;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0 || dates.length === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    let best = dates[0]!;
    for (const d of dates) if (Math.abs(x(d) - vx) < Math.abs(x(best) - vx)) best = d;
    setHover(best);
  };

  return (
    <div className="relative" data-testid="time-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>
              {num(t)}
            </text>
          </g>
        ))}
        {xTicks(range.from, range.to).map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {d.slice(5)}
          </text>
        ))}
        {refLine ? (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="4 3" />
            <text x={W - PAD.r} y={y(refLine.value) - 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.7}>
              {refLine.label}
            </text>
          </g>
        ) : null}
        {series.map((s) => {
          const color = TONE[s.tone];
          const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
          if (s.kind === 'line') {
            return pts.length < 2 ? null : <polyline key={s.id} data-series={s.id} fill="none" stroke={color} strokeWidth={2} points={pts.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')} />;
          }
          if (s.kind === 'dots') return pts.map((p) => <circle key={`${s.id}-${p.date}`} data-series={s.id} cx={x(p.date)} cy={y(p.value)} r={3} fill={color} fillOpacity={0.7} />);
          return pts.map((p) => <rect key={`${s.id}-${p.date}`} data-series={s.id} x={x(p.date) - barW / 2} y={y(Math.max(p.value, 0))} width={barW} height={Math.max(0, y(0) - y(Math.max(p.value, 0)))} fill={color} fillOpacity={0.75} />);
        })}
        {hover ? <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.4} /> : null}
      </svg>
      {hover ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow" data-testid="chart-tooltip">
          <div className="font-medium">{hover}</div>
          {series.map((s) => {
            const v = at(s, hover);
            return v === undefined ? null : (
              <div key={s.id}>
                {s.label}: {num(v)} {yUnit}
              </div>
            );
          })}
        </div>
      ) : null}
      <table className="sr-only" data-testid="chart-table">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => (
              <th key={s.id}>{`${s.label} (${yUnit})`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => (
            <tr key={d}>
              <td>{d}</td>
              {series.map((s) => (
                <td key={s.id}>{at(s, d) ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
