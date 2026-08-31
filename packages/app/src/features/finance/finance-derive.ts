import type { HistoryPoint } from './finance-types';

/** Price with a sensible precision: more decimals for sub-dollar (crypto) amounts. */
export function fmtPrice(n: number, currency = 'USD'): string {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/**
 * Gain/loss over a run of history points, first-vs-last close — the same
 * measure the source app's watchlist row uses, so the color/arrow always
 * agrees with what the 7-day sparkline actually shows (a 24h quote change
 * could disagree with a chart that visibly declines over the week).
 */
export function historyChange(points: readonly HistoryPoint[]): { pct: number | null; up: boolean } {
  const first = points[0]?.c;
  const last = points.at(-1)?.c;
  const pct = first && last ? ((last - first) / first) * 100 : null;
  return { pct, up: (pct ?? 0) >= 0 };
}
