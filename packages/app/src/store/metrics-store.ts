import { METRIC_IDS, type MetricId, type MetricSample } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * The live window of metric history the footer draws from.
 *
 * Three decisions are load-bearing here.
 *
 * **Points are `{value, at}`, not bare numbers.** The cadence is adaptive — 2s
 * with the flyout open, 5s without — so a series routinely holds points that
 * are 2s apart next to points that are 5s apart. The chart spaces by index
 * anyway (a time-scaled axis is real work for a five-minute window nobody
 * measures against), but keeping the timestamps is what lets it *mark* where
 * the cadence changed instead of silently drawing a 5s gap as if it were a 2s
 * one. A store of bare numbers could not tell you the distortion was there.
 *
 * **The window is evicted by time, not by count.** Five real minutes,
 * regardless of cadence. A fixed sample count would mean the window silently
 * became 2.5× longer whenever the flyout closed, so the same chart width would
 * show a different span depending on something the user did a minute ago.
 *
 * **The first sample seeds a flat series.** A single point draws no line, and a
 * series starting from an implicit zero ramps up to the current value — which
 * reads as a load spike that never happened, right at the moment the user
 * looked. Seeding two identical points draws a flat line at the true value,
 * which is the honest picture of "we have just started watching".
 */

export type MetricPoint = {
  /** 0–100. */
  value: number;
  /** Unix millis. */
  at: number;
};

/** The live window, in milliseconds. */
export const METRICS_WINDOW_MS = 5 * 60 * 1000;

/**
 * Hard cap on points per series, as a backstop rather than the eviction policy.
 *
 * Time is what evicts; this only bounds memory if a bug ever pushes samples in
 * a tight loop. At the 1s floor a five-minute window is 300 points, so this is
 * comfortably above anything the cadence can produce.
 */
export const METRICS_MAX_POINTS = 600;

/**
 * The Optimizer's own window — three times the footer's.
 *
 * The footer strip and its flyout answer "what is the machine doing right
 * now"; the Optimizer's System charts answer "what has it been doing while I
 * was building", which is a different question and a five-minute window
 * cannot hold the answer. Kept as a *second* window over the same samples
 * rather than by widening `METRICS_WINDOW_MS`, because the flyout's own copy
 * says "over the last five minutes" and its chart width is drawn for that
 * span — a 15-minute series in a 260-unit-wide box is three times the points
 * in the same pixels, which is a worse footer chart, not a better one.
 */
export const METRICS_LONG_WINDOW_MS = 15 * 60 * 1000;

/** `METRICS_MAX_POINTS`'s backstop, scaled to the longer window. */
export const METRICS_LONG_MAX_POINTS = 1800;

export type MetricSeries = Record<MetricId, MetricPoint[]>;

export type MetricsState = {
  series: MetricSeries;
  /**
   * The same samples over `METRICS_LONG_WINDOW_MS` — the Optimizer's System
   * charts read this, the footer reads `series`. Appended in the same `push`
   * so there is exactly one subscription and one arrival point for a sample;
   * a second store fed by a second listener is what
   * `use-metrics-stream.ts`'s ref-counting exists to prevent.
   */
  longSeries: MetricSeries;
  /** The most recent sample, for the footer's percentages and byte figures. */
  latest: MetricSample | null;
  push: (sample: MetricSample) => void;
  reset: () => void;
};

const emptySeries = (): MetricSeries => ({ cpu: [], memory: [], gpu: [], disk: [] });

export const useMetricsStore = create<MetricsState>((set) => ({
  series: emptySeries(),
  longSeries: emptySeries(),
  latest: null,
  push: (sample) =>
    set((state) => ({
      latest: sample,
      series: appendSample(state.series, sample),
      longSeries: appendSample(
        state.longSeries,
        sample,
        METRICS_LONG_WINDOW_MS,
        METRICS_LONG_MAX_POINTS,
      ),
    })),
  reset: () => set({ series: emptySeries(), longSeries: emptySeries(), latest: null }),
}));

/**
 * Append one sample to every series it carries a value for.
 *
 * Pure and exported so the eviction and seeding rules are testable without a
 * store instance — and so the rules are stated in one place rather than
 * spread through a zustand setter.
 *
 * A metric the sample omits is **not** touched: no push, no zero, no
 * placeholder. A GPU that vanished for a tick leaves a gap the timestamps
 * record, which is a truthful thing for the chart to show.
 */
export function appendSample(
  series: MetricSeries,
  sample: MetricSample,
  /** Defaulted so the footer's callers read exactly as they did before this
   *  became a two-window store; only the long series passes them. */
  windowMs: number = METRICS_WINDOW_MS,
  maxPoints: number = METRICS_MAX_POINTS,
): MetricSeries {
  const next: MetricSeries = { ...series };
  for (const id of METRIC_IDS) {
    const value = sample[id];
    if (typeof value !== 'number') continue;
    next[id] = appendPoint(series[id], { value, at: sample.at }, windowMs, maxPoints);
  }
  return next;
}

function appendPoint(
  existing: MetricPoint[],
  point: MetricPoint,
  windowMs: number,
  maxPoints: number,
): MetricPoint[] {
  const cutoff = point.at - windowMs;

  // One pass that both drops stale entries and appends the new point, rather
  // than an append-then-filter that copied the whole series twice every tick.
  // `entry.at >= cutoff` is applied per element in the same order as before,
  // so this is exactly the old filter's result — not a sorted-array shortcut,
  // which a backward clock jump would make unsafe.
  const kept: MetricPoint[] = [];
  if (existing.length === 0) {
    // The flat seed: the very first reading becomes two points at the same
    // value, one window-start behind the other. A lone point draws nothing,
    // and an implicit zero before it would draw a spike that never happened.
    const seed = { value: point.value, at: point.at - 1 };
    if (seed.at >= cutoff) kept.push(seed);
  } else {
    for (const entry of existing) {
      if (entry.at >= cutoff) kept.push(entry);
    }
  }
  // point.at >= cutoff always (cutoff is point.at minus a non-negative
  // window), so it is never itself dropped here.
  kept.push(point);

  return kept.length > maxPoints ? kept.slice(kept.length - maxPoints) : kept;
}
