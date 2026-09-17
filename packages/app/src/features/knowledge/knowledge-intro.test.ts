// Layer: vitest — pure math and bookkeeping with an injected clock, no rAF (see knowledge-intro.ts and its sibling knowledge-bounce.test.ts).
import { describe, expect, it } from 'vitest';

import { INTRO_TIMING, IntroTracker, computeCentroid, introEdgeAlphaMultiplier } from './knowledge-intro';

describe('computeCentroid', () => {
  it('averages every position', () => {
    expect(computeCentroid({ a: { x: 0, y: 0 }, b: { x: 10, y: 20 }, c: { x: 20, y: -20 } })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it('falls back to the origin when there is nothing to average', () => {
    expect(computeCentroid({})).toEqual({ x: 0, y: 0 });
  });

  it('is not fooled by an off-origin cluster — the whole point of not bursting from {0,0}', () => {
    const centroid = computeCentroid({ a: { x: 500, y: 500 }, b: { x: 520, y: 480 } });
    expect(centroid.x).toBeCloseTo(510);
    expect(centroid.y).toBeCloseTo(490);
  });
});

describe('IntroTracker', () => {
  const origin = { x: 0, y: 0 };

  it('is idle and empty until something starts', () => {
    const tracker = new IntroTracker();
    const sample = tracker.sample(0);
    expect(sample.positions.size).toBe(0);
    expect(sample.animating).toBe(false);
    expect(sample.progress).toBe(1);
  });

  it('places every node at the origin the instant the burst starts', () => {
    const tracker = new IntroTracker();
    tracker.start(
      [
        { id: 'a', to: { x: 100, y: 0 }, degree: 5 },
        { id: 'b', to: { x: 0, y: 100 }, degree: 1 },
      ],
      0,
      origin,
      { durationMs: 100, staggerMs: 0 },
    );
    const sample = tracker.sample(0);
    expect(sample.animating).toBe(true);
    expect(sample.positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(sample.positions.get('b')).toEqual({ x: 0, y: 0 });
  });

  it('lands every node on its target and reports not-animating once the whole burst has elapsed', () => {
    const tracker = new IntroTracker();
    tracker.start([{ id: 'a', to: { x: 100, y: 200 }, degree: 1 }], 0, origin, {
      durationMs: 100,
      staggerMs: 0,
    });
    const done = tracker.sample(100);
    expect(done.animating).toBe(false);
    expect(done.positions.get('a')).toEqual({ x: 100, y: 200 });
    expect(done.progress).toBe(1);
  });

  it('higher-degree nodes start (and therefore land) before lower-degree ones — the hubs-first stagger', () => {
    const tracker = new IntroTracker();
    tracker.start(
      [
        { id: 'leaf', to: { x: 100, y: 0 }, degree: 0 },
        { id: 'hub', to: { x: 0, y: 100 }, degree: 50 },
      ],
      0,
      origin,
      { durationMs: 100, staggerMs: 100 },
    );
    // Halfway into the stagger window: the hub (delay 0) is mid-tween, the
    // leaf (delay = full staggerMs since it's the lowest degree of two) has
    // not started yet and holds at the origin.
    const mid = tracker.sample(50);
    expect(mid.positions.get('hub')).not.toEqual(origin);
    expect(mid.positions.get('leaf')).toEqual(origin);
  });

  it('degree ties break on id, so the burst order is deterministic', () => {
    const tracker = new IntroTracker();
    tracker.start(
      [
        { id: 'b', to: { x: 1, y: 0 }, degree: 3 },
        { id: 'a', to: { x: 0, y: 1 }, degree: 3 },
      ],
      0,
      origin,
      { durationMs: 100, staggerMs: 100 },
    );
    // 'a' sorts before 'b' at equal degree, so 'a' starts first (delay 0) and 'b' lags (delay = staggerMs).
    const early = tracker.sample(10);
    expect(early.positions.get('a')).not.toEqual(origin);
    expect(early.positions.get('b')).toEqual(origin);
  });

  it('a zero-duration start lands everything immediately and reports idle', () => {
    const tracker = new IntroTracker();
    tracker.start([{ id: 'a', to: { x: 5, y: 5 }, degree: 1 }], 0, origin, { durationMs: 0, staggerMs: 0 });
    expect(tracker.animating).toBe(false);
    expect(tracker.sample(0).positions.size).toBe(0);
  });

  it('an empty node list is a no-op burst', () => {
    const tracker = new IntroTracker();
    tracker.start([], 0, origin, { durationMs: 100, staggerMs: 100 });
    expect(tracker.animating).toBe(false);
  });

  it('clear() drops every in-flight tween', () => {
    const tracker = new IntroTracker();
    tracker.start([{ id: 'a', to: { x: 5, y: 5 }, degree: 1 }], 0, origin, { durationMs: 100, staggerMs: 0 });
    tracker.clear();
    expect(tracker.animating).toBe(false);
    expect(tracker.sample(50).positions.size).toBe(0);
  });

  it('starting a new burst replaces an in-flight one outright, from the origin again', () => {
    const tracker = new IntroTracker();
    tracker.start([{ id: 'a', to: { x: 100, y: 100 } , degree: 1 }], 0, origin, { durationMs: 100, staggerMs: 0 });
    tracker.sample(50);
    tracker.start([{ id: 'b', to: { x: 5, y: 5 }, degree: 1 }], 50, origin, { durationMs: 100, staggerMs: 0 });
    const sample = tracker.sample(50);
    expect(sample.positions.has('a')).toBe(false);
    expect(sample.positions.get('b')).toEqual(origin);
  });
});

describe('introEdgeAlphaMultiplier', () => {
  it('starts at (or near) zero at the very beginning of the burst', () => {
    expect(introEdgeAlphaMultiplier(0)).toBeCloseTo(0);
  });

  it('reaches full alpha once the burst has finished', () => {
    expect(introEdgeAlphaMultiplier(1)).toBeCloseTo(1);
  });

  it('is monotonically non-decreasing across the burst', () => {
    let previous = -1;
    for (let i = 0; i <= 20; i++) {
      const value = introEdgeAlphaMultiplier(i / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('INTRO_TIMING', () => {
  it('stays fast enough to feel like an intro, not a wait', () => {
    expect(INTRO_TIMING.nodeDurationMs + INTRO_TIMING.staggerMs).toBeLessThanOrEqual(2000);
  });
});
