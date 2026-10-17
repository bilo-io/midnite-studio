import { describe, expect, it } from 'vitest';

import { createTickMap, metronomeClicks } from './tick-map';

describe('tick map', () => {
  it('converts at a constant tempo', () => {
    const map = createTickMap([{ tick: 0, bpm: 120 }]);
    expect(map.ticksToSeconds(480)).toBeCloseTo(0.5);
    expect(map.secondsToTicks(1)).toBeCloseTo(960);
  });

  it('follows tempo changes piecewise and round-trips', () => {
    const map = createTickMap([
      { tick: 0, bpm: 120 },
      { tick: 960, bpm: 60 },
    ]);
    expect(map.ticksToSeconds(960)).toBeCloseTo(1);
    expect(map.ticksToSeconds(1440)).toBeCloseTo(2);
    for (const tick of [0, 100, 960, 1200, 5000]) {
      expect(map.secondsToTicks(map.ticksToSeconds(tick))).toBeCloseTo(tick, 6);
    }
  });

  it('treats an empty map as 120 BPM', () => {
    expect(createTickMap([]).ticksToSeconds(960)).toBeCloseTo(1);
  });
});

describe('metronomeClicks', () => {
  it('accents the first beat of each bar', () => {
    const clicks = metronomeClicks([{ tick: 0, numerator: 4, denominator: 4 }], 480 * 8);
    expect(clicks.map((c) => c.accent)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('honors a time signature change', () => {
    const clicks = metronomeClicks(
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 4 },
      ],
      1920 + 1440,
    );
    expect(clicks).toHaveLength(4 + 3);
    expect(clicks[4]).toEqual({ tick: 1920, accent: true });
  });

  it('counts eighth-note beats in 6/8', () => {
    const clicks = metronomeClicks([{ tick: 0, numerator: 6, denominator: 8 }], 1440);
    expect(clicks).toHaveLength(6);
    expect(clicks[1]!.tick).toBe(240);
  });
});
