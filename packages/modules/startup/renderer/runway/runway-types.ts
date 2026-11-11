/**
 * The projection main answers `projection` with (`main/runway.ts`'s `RunwayProjection`). Declared here because the
 * renderer never imports the main half; the bridge types the answer as `unknown`, so the view parses it by shape.
 */
export type RunwayMonthView = { month: string; revenueMinor: number; costMinor: number; netMinor: number; cashMinor: number };
export type RunwayProjectionView = {
  months: RunwayMonthView[];
  burnMinor: number;
  runwayMonths: number | null;
  zeroCashMonth: string | null;
  defaultAlive: boolean;
};

export type Horizon = 12 | 24 | 36;
export const HORIZONS: readonly Horizon[] = [12, 24, 36];

/** "Beyond 36 months" for a runway that outlasts the horizon, else "10 months". */
export function runwayLabel(runwayMonths: number | null, horizon: Horizon): string {
  if (runwayMonths === null) return `Beyond ${horizon} months`;
  return `${runwayMonths} ${runwayMonths === 1 ? 'month' : 'months'}`;
}

/** Money as the company's currency, in whole units for headline cards. */
export function formatMinor(minor: number, currency: string): string {
  const exponent = currency === 'JPY' ? 0 : 2;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: exponent, minimumFractionDigits: 0 }).format(minor / 10 ** exponent);
  } catch {
    return `${(minor / 10 ** exponent).toFixed(exponent)} ${currency}`;
  }
}

/** SVG polyline points for one series, scaled to a `width` x `height` box with the zero line inside the range. */
export function chartPoints(series: readonly number[], min: number, max: number, width: number, height: number): string {
  const span = max - min || 1;
  return series
    .map((value, index) => {
      const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
