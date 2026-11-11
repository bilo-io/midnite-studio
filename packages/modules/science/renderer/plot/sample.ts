import type { ScienceCell } from '@midnite/studio-shared';

import { compile } from '../compute/math';

export type PlotCell = Extract<ScienceCell, { kind: 'plot' }>;

/** One plot's sampled data: shared x values and one y array per series (`NaN` where the value is not a real number). */
export type PlotSamples = { xs: number[]; series: { label: string; ys: number[] }[] };

export const PLOT_SAMPLES = 512;

/**
 * Samples every series of a plot cell at `PLOT_SAMPLES` evenly spaced x values (Phase 126 Theme E.1). Each
 * expression is compiled once and evaluated against a copy of the notebook scope with `x` set, so a plot can
 * use the notebook's variables. A non-finite or non-real result, or a failing expression, is `NaN`.
 */
export function samplePlot(cell: PlotCell, scope: ReadonlyMap<string, unknown>): PlotSamples {
  const { min, max } = cell.x;
  const xs = Array.from({ length: PLOT_SAMPLES }, (_, i) => min + ((max - min) * i) / (PLOT_SAMPLES - 1));
  const local = new Map(scope);
  const series = cell.series.map((s) => {
    let code: ReturnType<typeof compile> | null = null;
    try {
      code = compile(s.expr);
    } catch {
      code = null;
    }
    const ys = xs.map((x) => {
      if (code === null) return Number.NaN;
      local.set('x', x);
      try {
        const v: unknown = code.evaluate(local);
        return typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN;
      } catch {
        return Number.NaN;
      }
    });
    return { label: s.label ?? s.expr, ys };
  });
  return { xs, series };
}

/** The 2nd to 98th percentile of the finite samples across all series, padded 5 %; a flat series pads ±1. */
export function autoRange(ys: readonly number[]): { min: number; max: number } {
  const finite = ys.filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (finite.length === 0) return { min: -1, max: 1 };
  const at = (q: number) => finite[Math.min(finite.length - 1, Math.max(0, Math.round(q * (finite.length - 1))))]!;
  const lo = at(0.02);
  const hi = at(0.98);
  if (hi - lo === 0) return { min: lo - 1, max: hi + 1 };
  const pad = (hi - lo) * 0.05;
  return { min: lo - pad, max: hi + pad };
}
