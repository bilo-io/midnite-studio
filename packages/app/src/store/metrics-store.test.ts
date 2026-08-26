import { describe, expect, it } from 'vitest';

import { METRICS_MAX_POINTS, METRICS_WINDOW_MS, appendSample, type MetricSeries } from './metrics-store';

const empty = (): MetricSeries => ({ cpu: [], memory: [], gpu: [], disk: [] });

describe('appendSample', () => {
  it('seeds a new series flat rather than letting it ramp up from zero', () => {
    const series = appendSample(empty(), { at: 1_000, cpu: 80 });
    // Two points at the same value: a lone point draws no line at all, and an
    // implicit zero before it would draw a spike that never happened.
    expect(series.cpu.map((p) => p.value)).toEqual([80, 80]);
    expect(series.cpu[0]!.at).toBeLessThan(series.cpu[1]!.at);
  });

  it('appends without re-seeding once the series exists', () => {
    let series = appendSample(empty(), { at: 1_000, cpu: 80 });
    series = appendSample(series, { at: 3_000, cpu: 40 });
    expect(series.cpu.map((p) => p.value)).toEqual([80, 80, 40]);
  });

  it('stores timestamps, not just values', () => {
    // The whole reason the cadence gridline is possible: index spacing cannot
    // show that a gap was 5s rather than 2s, but the timestamps can.
    const series = appendSample(empty(), { at: 1_700_000_000_000, cpu: 50 });
    expect(series.cpu.at(-1)).toEqual({ value: 50, at: 1_700_000_000_000 });
  });

  it('does not touch a metric the sample omits', () => {
    let series = appendSample(empty(), { at: 1_000, cpu: 10, gpu: 20 });
    series = appendSample(series, { at: 2_000, cpu: 30 });
    // No zero, no placeholder, no repeat of the last value — the gap is real
    // and the timestamps record it.
    expect(series.gpu).toHaveLength(2);
    expect(series.cpu).toHaveLength(3);
  });

  it('leaves every series alone for a sample carrying nothing but a timestamp', () => {
    const series = appendSample(empty(), { at: 1_000 });
    expect(series).toEqual(empty());
  });

  it('keeps a zero reading, which is not the same as an absent one', () => {
    const series = appendSample(empty(), { at: 1_000, gpu: 0 });
    expect(series.gpu.map((p) => p.value)).toEqual([0, 0]);
  });

  it('evicts by time, so the window is five real minutes at either cadence', () => {
    let series = appendSample(empty(), { at: 0, cpu: 1 });
    for (let at = 60_000; at <= METRICS_WINDOW_MS; at += 60_000) {
      series = appendSample(series, { at, cpu: 2 });
    }
    // The seed pair at t=0 and t=-1 have fallen out of a window ending at 5min.
    series = appendSample(series, { at: METRICS_WINDOW_MS + 1, cpu: 3 });
    for (const point of series.cpu) {
      expect(point.at).toBeGreaterThanOrEqual(METRICS_WINDOW_MS + 1 - METRICS_WINDOW_MS);
    }
    expect(series.cpu.at(-1)!.value).toBe(3);
  });

  it('keeps a slow-cadence series as long as a fast one, in wall-clock terms', () => {
    // A count-based window would silently become 2.5x longer at the 5s
    // cadence; the span each holds is what has to match, not the point count.
    const build = (step: number) => {
      let series = empty();
      for (let at = 0; at <= METRICS_WINDOW_MS * 2; at += step) {
        series = appendSample(series, { at, cpu: 50 });
      }
      return series.cpu;
    };
    const fast = build(2_000);
    const slow = build(5_000);
    const span = (points: { at: number }[]) => points.at(-1)!.at - points[0]!.at;
    expect(span(fast)).toBeLessThanOrEqual(METRICS_WINDOW_MS);
    expect(span(slow)).toBeLessThanOrEqual(METRICS_WINDOW_MS);
    expect(span(slow)).toBeGreaterThan(METRICS_WINDOW_MS - 10_000);
    expect(fast.length).toBeGreaterThan(slow.length);
  });

  it('never grows past the memory backstop', () => {
    let series = empty();
    // Same timestamp every time defeats time-based eviction entirely, which is
    // exactly the runaway this cap exists to bound.
    for (let i = 0; i < METRICS_MAX_POINTS * 2; i += 1) {
      series = appendSample(series, { at: 5_000, cpu: 50 });
    }
    expect(series.cpu.length).toBeLessThanOrEqual(METRICS_MAX_POINTS);
  });

  it('always keeps the point just pushed, even if the clock jumped backwards', () => {
    let series = appendSample(empty(), { at: 10_000_000, cpu: 10 });
    series = appendSample(series, { at: 1_000, cpu: 20 });
    expect(series.cpu.at(-1)).toEqual({ value: 20, at: 1_000 });
  });

  it('does not mutate the series it was handed', () => {
    const before = appendSample(empty(), { at: 1_000, cpu: 10 });
    const snapshot = [...before.cpu];
    appendSample(before, { at: 2_000, cpu: 20 });
    expect(before.cpu).toEqual(snapshot);
  });
});
