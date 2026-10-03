import { MARKET_TIMESCALE_MS, type MarketCandle, type MarketTimescale } from '@midnite/studio-shared';

/**
 * Candle housekeeping shared by every provider — sorting, de-duplicating,
 * windowing to a timescale and thinning.
 */

/** Newest-bar-relative window, so a weekend's last session still fills "1D". */
export function trimToTimescale(candles: MarketCandle[], timescale: MarketTimescale): MarketCandle[] {
  const span = MARKET_TIMESCALE_MS[timescale];
  const last = candles[candles.length - 1];
  if (span === null || !last) return candles;
  const from = last.t - span;
  return candles.filter((c) => c.t >= from);
}

/** Ascending by time, one bar per timestamp, and no bar with a non-finite or non-positive price. */
export function cleanCandles(candles: MarketCandle[]): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>();
  for (const c of candles) {
    if (![c.t, c.o, c.h, c.l, c.c].every(Number.isFinite) || c.c <= 0 || c.o <= 0) continue;
    byTime.set(c.t, c);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/**
 * Thin a series to at most `max` bars by merging neighbours into one OHLC bar —
 * first open, highest high, lowest low, last close, summed volume. A plain
 * "keep every nth" would drop wicks, and a candlestick chart is mostly wicks.
 */
export function downsample(candles: MarketCandle[], max: number): MarketCandle[] {
  if (candles.length <= max || max < 2) return candles;
  const size = Math.ceil(candles.length / max);
  const out: MarketCandle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const group = candles.slice(i, i + size);
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    const volume = group.reduce((sum, c) => sum + (c.v ?? 0), 0);
    out.push({
      t: first.t,
      o: first.o,
      h: Math.max(...group.map((c) => c.h)),
      l: Math.min(...group.map((c) => c.l)),
      c: last.c,
      ...(volume > 0 ? { v: volume } : {}),
    });
  }
  return out;
}

export const MAX_SERIES_POINTS = 240;
