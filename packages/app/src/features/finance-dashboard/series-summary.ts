import type { MarketCandle } from '@midnite/studio-shared';

/**
 * A plain-language read of a price series — derived purely from the candles in
 * the selected timeframe.
 *
 * **No model is involved, anywhere.** Everything here is arithmetic over the
 * data on screen, written as two pure functions so it can be tested to the
 * decimal: {@link summarizeSeries} turns candles into numbers, and
 * {@link describeSummary} turns those numbers into sentences. Nothing is
 * fetched, nothing is remembered, and the same candles always say the same
 * thing — which is the property that makes it safe to put next to a chart
 * without anyone wondering whether it was made up.
 *
 * Percentages are scale-free, so a caller may convert candles to a display
 * currency first without changing any of them; only the absolute figures
 * (`changeAbs`, `high`, `low`, …) carry the currency, and `describeSummary`
 * formats those through an injected `money`.
 */

const YEAR_MS = 365 * 86_400_000;
const DAY_MS = 86_400_000;

/** How far a series must move to count as anything but flat. */
export const FLAT_THRESHOLD_PCT = 0.05;

export type Direction = 'up' | 'down' | 'flat';

export type VolatilityLabel = 'calm' | 'moderate' | 'high' | 'extreme';

export type BarUnit = 'bar' | 'day' | 'week' | 'month';

export type SeriesSummary = {
  /** Candles in the series. Everything else is meaningful only from 2 upward. */
  points: number;
  start: number;
  end: number;
  changeAbs: number;
  changePct: number;
  direction: Direction;
  high: number;
  highAt: number;
  low: number;
  lowAt: number;
  range: number;
  /** `range` as a percentage of the low. */
  rangePct: number;
  /** 0 at the low, 1 at the high; 0.5 for a series that never moved. */
  positionInRange: number;
  /** Stdev of bar-to-bar returns, in percent per bar. Null under 3 points. */
  barVolatilityPct: number | null;
  /** The same, scaled to a year by the series' own bar density. Null under 3 points. */
  annualizedVolatilityPct: number | null;
  volatility: VolatilityLabel | null;
  /** Worst peak-to-trough fall in closes, as a positive percentage. */
  maxDrawdownPct: number;
  drawdownPeakAt: number | null;
  drawdownTroughAt: number | null;
  /** The price is still below the pre-drawdown peak. */
  drawdownRecovered: boolean;
  /** Simple moving average of the last `maWindow` closes. Null under 3 points. */
  ma: number | null;
  maWindow: number;
  /** The last close relative to `ma`, in percent. */
  vsMaPct: number | null;
  trend: 'above' | 'below' | 'at' | null;
  /** Biggest single bar-to-bar close move, signed percent. */
  biggestMovePct: number | null;
  biggestMoveAt: number | null;
  barUnit: BarUnit;
  longestUp: number;
  longestDown: number;
  /** The run the series ends on. */
  currentStreak: { direction: 'up' | 'down'; length: number } | null;
  /** Share of bars that closed up, 0–1. */
  upBarShare: number | null;
};

export const volatilityLabel = (annualizedPct: number): VolatilityLabel =>
  annualizedPct < 20 ? 'calm' : annualizedPct < 45 ? 'moderate' : annualizedPct < 80 ? 'high' : 'extreme';

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
};

const barUnitFor = (spacingMs: number): BarUnit =>
  spacingMs >= 20 * DAY_MS ? 'month' : spacingMs >= 5 * DAY_MS ? 'week' : spacingMs >= 20 * 3_600_000 ? 'day' : 'bar';

const EMPTY: SeriesSummary = {
  points: 0,
  start: 0,
  end: 0,
  changeAbs: 0,
  changePct: 0,
  direction: 'flat',
  high: 0,
  highAt: 0,
  low: 0,
  lowAt: 0,
  range: 0,
  rangePct: 0,
  positionInRange: 0.5,
  barVolatilityPct: null,
  annualizedVolatilityPct: null,
  volatility: null,
  maxDrawdownPct: 0,
  drawdownPeakAt: null,
  drawdownTroughAt: null,
  drawdownRecovered: true,
  ma: null,
  maWindow: 0,
  vsMaPct: null,
  trend: null,
  biggestMovePct: null,
  biggestMoveAt: null,
  barUnit: 'bar',
  longestUp: 0,
  longestDown: 0,
  currentStreak: null,
  upBarShare: null,
};

/** Null for an empty series; a minimal summary for one point; the full read from two up. */
export function summarizeSeries(candles: readonly MarketCandle[]): SeriesSummary | null {
  const bars = candles.filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite));
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (!first || !last) return null;

  const closes = bars.map((c) => c.c);
  const start = first.c;
  const end = last.c;
  const changeAbs = end - start;
  const changePct = start > 0 ? (changeAbs / start) * 100 : 0;
  const direction: Direction =
    Math.abs(changePct) < FLAT_THRESHOLD_PCT ? 'flat' : changePct > 0 ? 'up' : 'down';

  let high = first.h;
  let highAt = first.t;
  let low = first.l;
  let lowAt = first.t;
  for (const bar of bars) {
    if (bar.h > high) {
      high = bar.h;
      highAt = bar.t;
    }
    if (bar.l < low) {
      low = bar.l;
      lowAt = bar.t;
    }
  }
  const range = high - low;

  const base: SeriesSummary = {
    ...EMPTY,
    points: bars.length,
    start,
    end,
    changeAbs,
    changePct,
    direction,
    high,
    highAt,
    low,
    lowAt,
    range,
    rangePct: low > 0 ? (range / low) * 100 : 0,
    positionInRange: range > 0 ? Math.min(1, Math.max(0, (end - low) / range)) : 0.5,
  };
  if (bars.length < 2) return base;

  // Bar-to-bar returns, in percent.
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1] ?? 0;
    returns.push(prev > 0 ? (((closes[i] ?? 0) - prev) / prev) * 100 : 0);
  }

  // Streaks and the biggest move.
  let longestUp = 0;
  let longestDown = 0;
  let run = 0;
  let runDir: 'up' | 'down' | null = null;
  let biggest = 0;
  let biggestAt: number | null = null;
  let ups = 0;
  returns.forEach((ret, i) => {
    const dir = ret > 0 ? 'up' : ret < 0 ? 'down' : null;
    if (dir === 'up') ups += 1;
    if (dir !== null && dir === runDir) run += 1;
    else {
      runDir = dir;
      run = dir === null ? 0 : 1;
    }
    if (runDir === 'up') longestUp = Math.max(longestUp, run);
    if (runDir === 'down') longestDown = Math.max(longestDown, run);
    if (Math.abs(ret) > Math.abs(biggest)) {
      biggest = ret;
      biggestAt = bars[i + 1]?.t ?? null;
    }
  });

  // Peak-to-trough on closes.
  let peak = closes[0] ?? 0;
  let peakAt = bars[0]?.t ?? 0;
  let worst = 0;
  let worstPeakAt: number | null = null;
  let worstTroughAt: number | null = null;
  let worstPeak = peak;
  bars.forEach((bar) => {
    if (bar.c > peak) {
      peak = bar.c;
      peakAt = bar.t;
    }
    const drop = peak > 0 ? ((peak - bar.c) / peak) * 100 : 0;
    if (drop > worst) {
      worst = drop;
      worstPeakAt = peakAt;
      worstTroughAt = bar.t;
      worstPeak = peak;
    }
  });

  const spacing = median(bars.slice(1).map((bar, i) => bar.t - (bars[i]?.t ?? bar.t)).filter((d) => d > 0));
  const result: SeriesSummary = {
    ...base,
    maxDrawdownPct: worst,
    drawdownPeakAt: worst > 0 ? worstPeakAt : null,
    drawdownTroughAt: worst > 0 ? worstTroughAt : null,
    drawdownRecovered: worst === 0 || end >= worstPeak,
    biggestMovePct: biggest,
    biggestMoveAt: biggestAt,
    barUnit: barUnitFor(spacing),
    longestUp,
    longestDown,
    currentStreak: runDir !== null && run > 0 ? { direction: runDir, length: run } : null,
    upBarShare: ups / returns.length,
  };

  if (bars.length < 3) return result;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const barVol = Math.sqrt(variance);
  const spanMs = last.t - first.t;
  // Scale by the density of bars actually observed, so a series thinned by
  // downsampling still annualises correctly.
  const barsPerYear = spanMs > 0 ? (returns.length / spanMs) * YEAR_MS : 0;
  const annualized = barVol * Math.sqrt(barsPerYear);

  const maWindow = Math.max(2, Math.min(20, Math.floor(bars.length / 3)));
  const tail = closes.slice(-maWindow);
  const ma = tail.reduce((a, b) => a + b, 0) / tail.length;
  const vsMaPct = ma > 0 ? ((end - ma) / ma) * 100 : 0;

  return {
    ...result,
    barVolatilityPct: barVol,
    annualizedVolatilityPct: annualized,
    volatility: volatilityLabel(annualized),
    ma,
    maWindow,
    vsMaPct,
    trend: Math.abs(vsMaPct) < FLAT_THRESHOLD_PCT ? 'at' : vsMaPct > 0 ? 'above' : 'below',
  };
}

// --- words -------------------------------------------------------------------------

export type SummaryTone = 'up' | 'down' | 'neutral';

/** The glyph a line wants; the view maps each to a react-icons component. */
export type SummaryIcon =
  | 'trend-up'
  | 'trend-down'
  | 'flat'
  | 'range'
  | 'volatility'
  | 'drawdown'
  | 'average'
  | 'move'
  | 'streak'
  | 'position'
  | 'bars';

export type SummaryLine = { id: string; icon: SummaryIcon; tone: SummaryTone; label: string; text: string };

export type DescribedSummary = {
  /** One sentence: what happened, how much, over what. */
  headline: string;
  tone: SummaryTone;
  /** The lines shown under the chart. */
  lines: SummaryLine[];
  /** The fuller breakdown the Insights button reveals — a superset of `lines`. */
  insights: SummaryLine[];
};

export type DescribeOptions = {
  /** Formats an absolute price in whatever currency the candles were converted to. */
  money: (value: number) => string;
  /** "past month", "all time" … */
  timeframe: string;
  /** Formats a timestamp; defaults to an ISO date. */
  date?: (t: number) => string;
};

const pct = (value: number, digits = 1): string => `${Math.abs(value).toFixed(digits)}%`;
const signed = (value: number, digits = 1): string => `${value >= 0 ? '+' : '−'}${pct(value, digits)}`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

const UNIT_WORD: Record<BarUnit, string> = { bar: 'bar', day: 'day', week: 'week', month: 'month' };

const positionWords = (p: number): string =>
  p >= 0.9 ? 'at the top of' : p >= 0.66 ? 'in the upper part of' : p > 0.34 ? 'around the middle of' : p > 0.1 ? 'in the lower part of' : 'at the bottom of';

const VOLATILITY_WORDS: Record<VolatilityLabel, string> = {
  calm: 'calm',
  moderate: 'moderately volatile',
  high: 'highly volatile',
  extreme: 'extremely volatile',
};

export function describeSummary(summary: SeriesSummary | null, options: DescribeOptions): DescribedSummary {
  const date = options.date ?? ((t: number) => new Date(t).toISOString().slice(0, 10));
  const { money, timeframe } = options;

  if (!summary || summary.points === 0) {
    return { headline: 'No price data for this timeframe.', tone: 'neutral', lines: [], insights: [] };
  }
  if (summary.points < 2) {
    return {
      headline: `Only one price is available: ${money(summary.end)}.`,
      tone: 'neutral',
      lines: [],
      insights: [],
    };
  }

  const tone: SummaryTone = summary.direction === 'flat' ? 'neutral' : summary.direction;
  const headline =
    summary.direction === 'flat'
      ? `Flat over the ${timeframe} — ${money(summary.start)} to ${money(summary.end)} (${signed(summary.changePct, 2)}).`
      : `${summary.direction === 'up' ? 'Up' : 'Down'} ${pct(summary.changePct)} over the ${timeframe}, from ${money(summary.start)} to ${money(summary.end)}.`;

  const lines: SummaryLine[] = [];
  const insights: SummaryLine[] = [];
  const unit = UNIT_WORD[summary.barUnit];

  const rangeLine: SummaryLine = {
    id: 'range',
    icon: 'range',
    tone: 'neutral',
    label: 'Range',
    text:
      summary.range > 0
        ? `High ${money(summary.high)}, low ${money(summary.low)} — a ${money(summary.range)} (${pct(summary.rangePct)}) spread.`
        : `No movement — held at ${money(summary.end)}.`,
  };
  lines.push(rangeLine);

  const positionLine: SummaryLine = {
    id: 'position',
    icon: 'position',
    tone: summary.positionInRange >= 0.5 ? 'up' : 'down',
    label: 'Position',
    text:
      summary.range > 0
        ? `Now ${positionWords(summary.positionInRange)} its range (${Math.round(summary.positionInRange * 100)}% of the way from low to high).`
        : 'The price has not moved, so it sits mid-range by definition.',
  };
  lines.push(positionLine);

  let volLine: SummaryLine | null = null;
  if (summary.volatility && summary.annualizedVolatilityPct !== null) {
    volLine = {
      id: 'volatility',
      icon: 'volatility',
      tone: 'neutral',
      label: 'Volatility',
      text: `${VOLATILITY_WORDS[summary.volatility][0]?.toUpperCase()}${VOLATILITY_WORDS[summary.volatility].slice(1)} — about ${summary.annualizedVolatilityPct.toFixed(0)}% annualised.`,
    };
    lines.push(volLine);
  }

  const drawdownLine: SummaryLine = {
    id: 'drawdown',
    icon: 'drawdown',
    tone: summary.maxDrawdownPct > 0 ? 'down' : 'up',
    label: 'Max drawdown',
    text:
      summary.maxDrawdownPct > 0
        ? `Fell ${pct(summary.maxDrawdownPct)} from the ${date(summary.drawdownPeakAt ?? 0)} peak to the ${date(summary.drawdownTroughAt ?? 0)} trough${summary.drawdownRecovered ? ', and has since recovered' : ', and is still below that peak'}.`
        : 'Never closed below an earlier high — no drawdown.',
  };
  lines.push(drawdownLine);

  if (summary.trend && summary.vsMaPct !== null) {
    lines.push({
      id: 'trend',
      icon: 'average',
      tone: summary.trend === 'above' ? 'up' : summary.trend === 'below' ? 'down' : 'neutral',
      label: 'Trend',
      text:
        summary.trend === 'at'
          ? `Right on its ${summary.maWindow}-bar average.`
          : `${pct(summary.vsMaPct)} ${summary.trend} its ${summary.maWindow}-bar average — ${summary.trend === 'above' ? 'momentum is positive' : 'momentum is negative'}.`,
    });
  }

  if (summary.biggestMovePct !== null && summary.biggestMoveAt !== null && summary.biggestMovePct !== 0) {
    lines.push({
      id: 'move',
      icon: 'move',
      tone: summary.biggestMovePct > 0 ? 'up' : 'down',
      label: `Biggest ${unit}`,
      text: `${signed(summary.biggestMovePct, 2)} on ${date(summary.biggestMoveAt)}.`,
    });
  }

  if (summary.currentStreak) {
    const { direction, length } = summary.currentStreak;
    lines.push({
      id: 'streak',
      icon: 'streak',
      tone: direction,
      label: 'Streak',
      text: `${plural(length, `${direction === 'up' ? 'up' : 'down'} ${unit}`)} in a row to finish; longest run up ${summary.longestUp}, down ${summary.longestDown}.`,
    });
  }

  // The Insights view: everything above, plus the numbers behind it.
  insights.push(...lines);
  insights.push({
    id: 'bars',
    icon: 'bars',
    tone: 'neutral',
    label: 'Sample',
    text: `${plural(summary.points, 'bar')}${summary.upBarShare !== null ? `, ${Math.round(summary.upBarShare * 100)}% of them closing up` : ''}.`,
  });
  if (summary.barVolatilityPct !== null) {
    insights.push({
      id: 'bar-volatility',
      icon: 'volatility',
      tone: 'neutral',
      label: `Typical ${unit}`,
      text: `A typical ${unit}-to-${unit} swing is ${pct(summary.barVolatilityPct, 2)} (one standard deviation).`,
    });
  }
  insights.push({
    id: 'extremes',
    icon: 'range',
    tone: 'neutral',
    label: 'Extremes',
    text: `High on ${date(summary.highAt)}, low on ${date(summary.lowAt)}.`,
  });
  if (summary.ma !== null) {
    insights.push({
      id: 'average',
      icon: 'average',
      tone: 'neutral',
      label: 'Average',
      text: `The ${summary.maWindow}-bar average is ${money(summary.ma)}; the last close is ${money(summary.end)}.`,
    });
  }
  insights.push({
    id: 'change',
    icon: summary.direction === 'down' ? 'trend-down' : summary.direction === 'up' ? 'trend-up' : 'flat',
    tone,
    label: 'Net change',
    text: `${summary.changeAbs >= 0 ? '+' : '−'}${money(Math.abs(summary.changeAbs))} (${signed(summary.changePct, 2)}) from first to last close.`,
  });

  return { headline, tone, lines, insights };
}
