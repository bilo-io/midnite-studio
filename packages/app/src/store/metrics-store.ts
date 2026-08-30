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

export type MetricSeries = Record<MetricId, MetricPoint[]>;

export type MetricsState = {
  series: MetricSeries;
  /** The most recent sample, for the footer's percentages and byte figures. */
  latest: MetricSample | null;
  push: (sample: MetricSample) => void;
  reset: () => void;
};

const emptySeries = (): MetricSeries => ({ cpu: [], memory: [], gpu: [], disk: [] });

export const useMetricsStore = create<MetricsState>((set) => ({
  series: emptySeries(),
  latest: null,
  push: (sample) =>
    set((state) => ({
      latest: sample,
      series: appendSample(state.series, sample),
    })),
  reset: () => set({ series: emptySeries(), latest: null }),
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
export function appendSample(series: MetricSeries, sample: MetricSample): MetricSeries {
  const next: MetricSeries = { ...series };
  for (const id of METRIC_IDS) {
    const value = sample[id];
    if (typeof value !== 'number') continue;
    next[id] = appendPoint(series[id], { value, at: sample.at });
  }
  return next;
}

function appendPoint(existing: MetricPoint[], point: MetricPoint): MetricPoint[] {
  // The flat seed: the very first reading becomes two points at the same
  // value, one window-start behind the other. A lone point draws nothing, and
  // an implicit zero before it would draw a spike that never happened.
  const seeded =
    existing.length === 0 ? [{ value: point.value, at: point.at - 1 }, point] : [...existing, point];

  const cutoff = point.at - METRICS_WINDOW_MS;
  const windowed = seeded.filter((entry) => entry.at >= cutoff);
  // The seed pair can itself fall outside the window if the clock jumped;
  // never return fewer than the point just pushed.
  const kept = windowed.length === 0 ? [point] : windowed;
  return kept.length > METRICS_MAX_POINTS ? kept.slice(kept.length - METRICS_MAX_POINTS) : kept;
}
