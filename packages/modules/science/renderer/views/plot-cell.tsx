import { LuPlus, LuX } from 'react-icons/lu';

import type { ScienceCell } from '@midnite/studio-shared';

import { PlotSvg } from '../plot/plot-svg';
import type { PlotCell, PlotSamples } from '../plot/sample';

const MAX_SERIES = 4;
const input = 'rounded-md border border-border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-ring';

/** Parses a number input; an empty or invalid entry keeps the previous value. */
function num(raw: string, fallback: number): number {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : fallback;
}

/** A plot cell (Phase 126 Theme E.2): series rows, x range, y range, then the drawn plot. */
export function PlotCellView({ cell, samples, onChange }: { cell: PlotCell; samples: PlotSamples | undefined; onChange: (cell: ScienceCell) => void }) {
  const patch = (next: Partial<PlotCell>) => onChange({ ...cell, ...next });
  const setSeries = (i: number, next: Partial<PlotCell['series'][number]>) =>
    patch({ series: cell.series.map((s, j) => (j === i ? { ...s, ...next } : s)) });
  // The schema requires max > min; an entry that breaks it is ignored until the other bound moves.
  const setX = (min: number, max: number) => {
    if (max > min) patch({ x: { min, max } });
  };
  const auto = cell.y === 'auto';
  return (
    <div className="space-y-2 p-1" data-testid="plot-cell">
      {cell.series.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`Series ${i + 1} expression`} className={`${input} flex-1`} value={s.expr} spellCheck={false} onChange={(e) => setSeries(i, { expr: e.target.value })} />
          <input
            aria-label={`Series ${i + 1} label`}
            className={`${input} w-32`}
            placeholder="label"
            value={s.label ?? ''}
            onChange={(e) => {
              const { label: _drop, ...rest } = s;
              patch({ series: cell.series.map((t, j) => (j === i ? (e.target.value === '' ? rest : { ...rest, label: e.target.value }) : t)) });
            }}
          />
          <button type="button" aria-label={`Remove series ${i + 1}`} disabled={cell.series.length === 1} onClick={() => patch({ series: cell.series.filter((_, j) => j !== i) })}>
            <LuX aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="inline-flex items-center gap-1" disabled={cell.series.length >= MAX_SERIES} onClick={() => patch({ series: [...cell.series, { expr: 'x' }] })}>
          <LuPlus aria-hidden /> Add series
        </button>
        <label className="inline-flex items-center gap-1">
          x
          <input aria-label="x min" type="number" className={`${input} w-20`} value={cell.x.min} onChange={(e) => setX(num(e.target.value, cell.x.min), cell.x.max)} />
          to
          <input aria-label="x max" type="number" className={`${input} w-20`} value={cell.x.max} onChange={(e) => setX(cell.x.min, num(e.target.value, cell.x.max))} />
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            aria-label="Auto y range"
            checked={auto}
            onChange={(e) => patch({ y: e.target.checked ? 'auto' : { min: -1, max: 1 } })}
          />
          y auto
        </label>
        {cell.y !== 'auto' ? (
          <span className="inline-flex items-center gap-1">
            <input aria-label="y min" type="number" className={`${input} w-20`} value={cell.y.min} onChange={(e) => patch({ y: { ...(cell.y as { min: number; max: number }), min: num(e.target.value, (cell.y as { min: number }).min) } })} />
            to
            <input aria-label="y max" type="number" className={`${input} w-20`} value={cell.y.max} onChange={(e) => patch({ y: { ...(cell.y as { min: number; max: number }), max: num(e.target.value, (cell.y as { max: number }).max) } })} />
          </span>
        ) : null}
      </div>
      {samples !== undefined ? <PlotSvg samples={samples} y={cell.y} /> : <p className="text-xs opacity-60">Plotting…</p>}
    </div>
  );
}
