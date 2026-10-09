import { describe, expect, it } from 'vitest';

import { createTickMap } from '../engine/tick-map';
import { insertPoint, laneEvents, movePoint, normalisePoints, removePoint, valueAt, valueAtSeconds } from './automation';

const lane = (curve: 'linear' | 'step', points: { tick: number; value: number }[]) => ({ curve, points });

describe('valueAt', () => {
  const l = lane('linear', [
    { tick: 480, value: 0 },
    { tick: 960, value: 1 },
    { tick: 1920, value: 0.5 },
  ]);
  it('holds the first value before the lane and the last after it', () => {
    expect(valueAt(l, 0, 9)).toBe(0);
    expect(valueAt(l, 5000, 9)).toBe(0.5);
  });
  it('interpolates linearly between breakpoints', () => {
    expect(valueAt(l, 720, 9)).toBeCloseTo(0.5);
    expect(valueAt(l, 1440, 9)).toBeCloseTo(0.75);
    expect(valueAt(l, 960, 9)).toBe(1);
  });
  it('holds the previous value on a step lane', () => {
    const s = lane('step', l.points);
    expect(valueAt(s, 959, 9)).toBe(0);
    expect(valueAt(s, 960, 9)).toBe(1);
    expect(valueAt(s, 1919, 9)).toBe(1);
  });
  it('falls back for an empty lane', () => expect(valueAt(lane('linear', []), 100, 0.8)).toBe(0.8));
});

describe('laneEvents', () => {
  const map = createTickMap([{ tick: 0, bpm: 120 }]); // 480 ticks = 0.5 s
  it('emits only the breakpoints for a step lane', () => {
    const ev = laneEvents(lane('step', [{ tick: 0, value: 0 }, { tick: 4800, value: 1 }]), map);
    expect(ev).toEqual([{ time: 0, value: 0 }, { time: 5, value: 1 }]);
  });
  it('subdivides a linear segment no wider than the resolution and ends on the next breakpoint', () => {
    const ev = laneEvents(lane('linear', [{ tick: 0, value: 0 }, { tick: 960, value: 1 }]), map, 0.25);
    expect(ev.map((e) => e.time)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(ev[2]!.value).toBeCloseTo(0.5);
    expect(ev[4]).toEqual({ time: 1, value: 1 });
  });
  it('does not subdivide a flat segment', () => {
    expect(laneEvents(lane('linear', [{ tick: 0, value: 1 }, { tick: 9600, value: 1 }]), map)).toHaveLength(2);
  });
  it('bakes the tempo map into the times', () => {
    const fast = createTickMap([{ tick: 0, bpm: 240 }]);
    expect(laneEvents(lane('step', [{ tick: 480, value: 1 }]), fast)[0]!.time).toBeCloseTo(0.25);
  });
});

describe('valueAtSeconds', () => {
  const ev = [{ time: 1, value: 10 }, { time: 2, value: 20 }];
  it('takes the last event at or before the time, the first before them all', () => {
    expect(valueAtSeconds(ev, 0, 5)).toBe(10);
    expect(valueAtSeconds(ev, 1.5, 5)).toBe(10);
    expect(valueAtSeconds(ev, 2, 5)).toBe(20);
    expect(valueAtSeconds([], 2, 5)).toBe(5);
  });
});

describe('point edits', () => {
  it('keeps points sorted and replaces one on the same tick', () => {
    let pts = insertPoint([], { tick: 960, value: 1 })!;
    pts = insertPoint(pts, { tick: 0, value: 0 })!;
    pts = insertPoint(pts, { tick: 960, value: 0.4 })!;
    expect(pts).toEqual([{ tick: 0, value: 0 }, { tick: 960, value: 0.4 }]);
  });
  it('cannot drag a point past its neighbour', () => {
    const pts = [{ tick: 0, value: 0 }, { tick: 100, value: 1 }, { tick: 200, value: 0 }];
    expect(movePoint(pts, 1, { tick: 500, value: 0.3 })[1]).toEqual({ tick: 199, value: 0.3 });
    expect(movePoint(pts, 1, { tick: -5, value: 0.3 })[1]!.tick).toBe(1);
  });
  it('removes by index and normalises duplicates', () => {
    expect(removePoint([{ tick: 0, value: 0 }, { tick: 1, value: 1 }], 0)).toEqual([{ tick: 1, value: 1 }]);
    expect(normalisePoints([{ tick: 5, value: 1 }, { tick: 5, value: 2 }])).toEqual([{ tick: 5, value: 2 }]);
  });
});
