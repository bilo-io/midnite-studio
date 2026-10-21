import type { MarketCandle } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { describeSummary, summarizeSeries, volatilityLabel } from './series-summary';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

/** Daily candles from closes, with a fixed 1-unit wick either side. */
const fromCloses = (closes: number[], step = DAY): MarketCandle[] =>
  closes.map((c, i) => ({ t: T0 + i * step, o: c, h: c + 1, l: c - 1, c }));

const money = (n: number): string => `$${n.toFixed(2)}`;
const describe_ = (closes: number[], timeframe = 'past month') =>
  describeSummary(summarizeSeries(fromCloses(closes)), { money, timeframe });

describe('summarizeSeries — degenerate inputs', () => {
  it('returns null for an empty series', () => {
    expect(summarizeSeries([])).toBeNull();
  });

  it('returns null when every candle is non-finite', () => {
    expect(summarizeSeries([{ t: 1, o: NaN, h: NaN, l: NaN, c: NaN }])).toBeNull();
  });

  it('gives a minimal summary for a single point', () => {
    const s = summarizeSeries(fromCloses([100]));
    expect(s).toMatchObject({ points: 1, start: 100, end: 100, changeAbs: 0, changePct: 0, direction: 'flat' });
    expect(s?.annualizedVolatilityPct).toBeNull();
    expect(s?.ma).toBeNull();
    expect(s?.currentStreak).toBeNull();
  });

  it('gives a partial summary for two points: change and streak, no volatility', () => {
    const s = summarizeSeries(fromCloses([100, 110]));
    expect(s).toMatchObject({ changePct: 10, direction: 'up', longestUp: 1, biggestMovePct: 10 });
    expect(s?.volatility).toBeNull();
    expect(s?.trend).toBeNull();
  });
});

describe('summarizeSeries — shapes', () => {
  it('reads a flat series as flat, with no drawdown, no streak and mid-range position', () => {
    const s = summarizeSeries(Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * DAY, o: 50, h: 50, l: 50, c: 50 })));
    expect(s).toMatchObject({
      direction: 'flat',
      changePct: 0,
      range: 0,
      positionInRange: 0.5,
      maxDrawdownPct: 0,
      longestUp: 0,
      longestDown: 0,
      currentStreak: null,
      volatility: 'calm',
      trend: 'at',
    });
    expect(s?.annualizedVolatilityPct).toBe(0);
  });

  it('reads a steady rise: up, top of range, above its average, long up streak', () => {
    const s = summarizeSeries(fromCloses([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]));
    expect(s?.direction).toBe('up');
    expect(s?.changePct).toBeCloseTo(10, 5);
    expect(s?.changeAbs).toBe(10);
    expect(s?.positionInRange).toBeGreaterThan(0.9);
    expect(s?.trend).toBe('above');
    expect(s?.vsMaPct).toBeGreaterThan(0);
    expect(s?.longestUp).toBe(10);
    expect(s?.currentStreak).toEqual({ direction: 'up', length: 10 });
    expect(s?.maxDrawdownPct).toBe(0);
    expect(s?.upBarShare).toBe(1);
  });

  it('reads a steady fall: down, bottom of range, below its average, drawdown equal to the fall', () => {
    const s = summarizeSeries(fromCloses([110, 108, 106, 104, 102, 100]));
    expect(s?.direction).toBe('down');
    expect(s?.changePct).toBeCloseTo(-9.0909, 3);
    expect(s?.positionInRange).toBeLessThan(0.1);
    expect(s?.trend).toBe('below');
    expect(s?.maxDrawdownPct).toBeCloseTo(9.0909, 3);
    expect(s?.drawdownRecovered).toBe(false);
    expect(s?.currentStreak).toEqual({ direction: 'down', length: 5 });
  });

  it('flags a violent series as extreme and a placid one as calm', () => {
    const violent = summarizeSeries(fromCloses([100, 130, 90, 140, 80, 150, 70, 160, 60, 170]));
    const placid = summarizeSeries(fromCloses([100, 100.1, 100, 100.1, 100, 100.1, 100, 100.1, 100, 100.1]));
    expect(violent?.volatility).toBe('extreme');
    expect(placid?.volatility).toBe('calm');
    expect(violent?.annualizedVolatilityPct ?? 0).toBeGreaterThan(placid?.annualizedVolatilityPct ?? 1);
  });

  it('finds the biggest single move and when it happened', () => {
    const s = summarizeSeries(fromCloses([100, 101, 90, 91, 92]));
    expect(s?.biggestMovePct).toBeCloseTo(-10.891, 2);
    expect(s?.biggestMoveAt).toBe(T0 + 2 * DAY);
  });

  it('measures max drawdown peak to trough, and notes a recovery', () => {
    const s = summarizeSeries(fromCloses([100, 120, 90, 100, 125]));
    expect(s?.maxDrawdownPct).toBeCloseTo(25, 5);
    expect(s?.drawdownPeakAt).toBe(T0 + 1 * DAY);
    expect(s?.drawdownTroughAt).toBe(T0 + 2 * DAY);
    expect(s?.drawdownRecovered).toBe(true);
  });

  it('tracks the longest runs separately from the current one', () => {
    const s = summarizeSeries(fromCloses([100, 101, 102, 103, 102, 101, 102]));
    expect(s?.longestUp).toBe(3);
    expect(s?.longestDown).toBe(2);
    expect(s?.currentStreak).toEqual({ direction: 'up', length: 1 });
  });

  it('breaks a streak on an unchanged close', () => {
    const s = summarizeSeries(fromCloses([100, 101, 102, 102, 103]));
    expect(s?.longestUp).toBe(2);
    expect(s?.currentStreak).toEqual({ direction: 'up', length: 1 });
  });

  it('takes high and low from the wicks, not the closes', () => {
    const s = summarizeSeries([
      { t: 1, o: 10, h: 20, l: 5, c: 12 },
      { t: 2, o: 12, h: 14, l: 11, c: 13 },
    ]);
    expect(s).toMatchObject({ high: 20, highAt: 1, low: 5, lowAt: 1, range: 15 });
  });

  it('treats a move under the flat threshold as flat', () => {
    expect(summarizeSeries(fromCloses([100, 100.01]))?.direction).toBe('flat');
  });

  it('infers the bar unit from the spacing', () => {
    expect(summarizeSeries(fromCloses([1, 2, 3], 15 * 60_000))?.barUnit).toBe('bar');
    expect(summarizeSeries(fromCloses([1, 2, 3], DAY))?.barUnit).toBe('day');
    expect(summarizeSeries(fromCloses([1, 2, 3], 7 * DAY))?.barUnit).toBe('week');
    expect(summarizeSeries(fromCloses([1, 2, 3], 30 * DAY))?.barUnit).toBe('month');
  });

  it('annualises by observed bar density, so thinning a series does not change the answer much', () => {
    const daily = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const thinned = daily.filter((_, i) => i % 2 === 0);
    const a = summarizeSeries(fromCloses(daily))?.annualizedVolatilityPct ?? 0;
    const b = summarizeSeries(fromCloses(thinned, 2 * DAY))?.annualizedVolatilityPct ?? 0;
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b) / a).toBeLessThan(0.6);
  });

  it('does not mutate its input', () => {
    const input = fromCloses([100, 101, 99]);
    const copy = JSON.stringify(input);
    summarizeSeries(input);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('is deterministic', () => {
    const input = fromCloses([100, 105, 95, 110, 90, 120]);
    expect(summarizeSeries(input)).toEqual(summarizeSeries(input));
  });
});

describe('volatilityLabel', () => {
  it.each([
    [0, 'calm'],
    [19.9, 'calm'],
    [20, 'moderate'],
    [44.9, 'moderate'],
    [45, 'high'],
    [79.9, 'high'],
    [80, 'extreme'],
    [400, 'extreme'],
  ])('%s%% annualised is %s', (value, label) => {
    expect(volatilityLabel(value)).toBe(label);
  });
});

describe('describeSummary', () => {
  it('says so when there is nothing to describe', () => {
    expect(describeSummary(null, { money, timeframe: 'past day' })).toEqual({
      headline: 'No price data for this timeframe.',
      tone: 'neutral',
      lines: [],
      insights: [],
    });
  });

  it('says so for a single point', () => {
    const out = describeSummary(summarizeSeries(fromCloses([42])), { money, timeframe: 'past day' });
    expect(out.headline).toBe('Only one price is available: $42.00.');
    expect(out.lines).toEqual([]);
  });

  it('headlines a rise in the up tone, with the figures', () => {
    const out = describe_([100, 105, 110, 112]);
    expect(out.tone).toBe('up');
    expect(out.headline).toBe('Up 12.0% over the past month, from $100.00 to $112.00.');
  });

  it('headlines a fall in the down tone', () => {
    const out = describe_([100, 95, 90, 88]);
    expect(out.tone).toBe('down');
    expect(out.headline).toBe('Down 12.0% over the past month, from $100.00 to $88.00.');
  });

  it('headlines flat as neutral', () => {
    const out = describe_([100, 100, 100, 100]);
    expect(out.tone).toBe('neutral');
    expect(out.headline).toContain('Flat over the past month');
  });

  it('describes every facet for a normal series, each with a tone', () => {
    const out = describe_([100, 120, 90, 100, 125, 124, 126, 127, 126, 130, 128, 131]);
    expect(out.lines.map((l) => l.id)).toEqual(['range', 'position', 'volatility', 'drawdown', 'trend', 'move', 'streak']);
    expect(out.lines.find((l) => l.id === 'drawdown')?.tone).toBe('down');
    expect(out.lines.find((l) => l.id === 'trend')?.tone).toBe('up');
    expect(out.lines.find((l) => l.id === 'drawdown')?.text).toContain('Fell 25.0%');
    expect(out.lines.find((l) => l.id === 'drawdown')?.text).toContain('since recovered');
  });

  it('puts the same lines, plus more, in the insights', () => {
    const out = describe_([100, 120, 90, 100, 125, 124, 126, 127, 126, 130, 128, 131]);
    expect(out.insights.length).toBeGreaterThan(out.lines.length);
    for (const line of out.lines) expect(out.insights).toContainEqual(line);
    expect(out.insights.map((l) => l.id)).toEqual(expect.arrayContaining(['bars', 'extremes', 'change', 'average']));
  });

  it('formats money and dates through the injected functions', () => {
    const out = describeSummary(summarizeSeries(fromCloses([100, 90, 95])), {
      money: (n) => `R${n.toFixed(0)}`,
      timeframe: 'past week',
      date: (t) => `d${(t - T0) / DAY}`,
    });
    expect(out.headline).toContain('R100');
    expect(out.lines.find((l) => l.id === 'drawdown')?.text).toContain('d0 peak');
  });

  it('never prints NaN or undefined, however odd the series', () => {
    const odd = [
      [],
      [5],
      [5, 5],
      [5, 6],
      [1, 1000, 1, 1000],
      [100, 100, 100],
    ].map((closes) => describe_(closes as number[]));
    for (const out of odd) {
      const text = [out.headline, ...out.lines.map((l) => l.text), ...out.insights.map((l) => l.text)].join(' ');
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('pluralises streaks', () => {
    expect(describe_([100, 101]).lines.find((l) => l.id === 'streak')?.text).toContain('1 up day in a row');
    expect(describe_([100, 101, 102]).lines.find((l) => l.id === 'streak')?.text).toContain('2 up days in a row');
  });
});
