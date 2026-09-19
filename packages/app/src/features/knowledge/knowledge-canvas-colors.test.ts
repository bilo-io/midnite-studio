// Layer: vitest — pure string/number math, no canvas needed.
import { describe, expect, it } from 'vitest';

import {
  AlphaRampTracker,
  DEFAULT_NODE_ALPHA,
  DIMMED_ALPHA,
  NEIGHBOR_NODE_ALPHA,
  alphaForWeight,
  nodeColorForState,
  targetAlphaForState,
  withAlpha,
} from './knowledge-canvas-colors';

describe('withAlpha', () => {
  it('turns an rgb() string into a PREMULTIPLIED rgba() — sigma blends with ONE / ONE_MINUS_SRC_ALPHA', () => {
    expect(withAlpha('rgb(60, 131, 246)', 0.2)).toBe('rgba(12, 26, 49, 0.2)');
  });

  it('alpha 1 leaves the channels untouched; alpha 0 zeroes them', () => {
    expect(withAlpha('rgb(60, 131, 246)', 1)).toBe('rgba(60, 131, 246, 1)');
    expect(withAlpha('rgb(60, 131, 246)', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('clamps alpha into 0..1', () => {
    expect(withAlpha('rgb(100, 100, 100)', 2)).toBe('rgba(100, 100, 100, 1)');
    expect(withAlpha('rgb(100, 100, 100)', -1)).toBe('rgba(0, 0, 0, 0)');
  });

  it('keeps every channel an integer — sigma parses rgba() channels with [0-9]*', () => {
    expect(withAlpha('rgb(255, 1, 7)', 0.3)).toBe('rgba(77, 0, 2, 0.3)');
  });

  it('returns the input unchanged if it is not rgb()-shaped', () => {
    expect(withAlpha('#fff', 0.2)).toBe('#fff');
    expect(withAlpha('hsl(217 91% 60%)', 0.2)).toBe('hsl(217 91% 60%)');
  });
});

describe('alphaForWeight', () => {
  it('maps 0 to the floor and 1 to the ceiling', () => {
    expect(alphaForWeight(0)).toBe(0.15);
    expect(alphaForWeight(1)).toBe(0.8);
  });

  it('clamps a weight outside 0..1', () => {
    expect(alphaForWeight(-5)).toBe(0.15);
    expect(alphaForWeight(5)).toBe(0.8);
  });

  it('interpolates in between', () => {
    expect(alphaForWeight(0.5)).toBeCloseTo(0.475);
  });
});

describe('nodeColorForState', () => {
  const base = 'rgb(100, 200, 50)';

  it('returns semitransparent color at rest when unselected', () => {
    expect(nodeColorForState(base, { dimmed: false, isFocus: false, isNeighbor: false })).toBe(
      withAlpha(base, DEFAULT_NODE_ALPHA),
    );
  });

  it('returns full base color when focused / selected', () => {
    expect(nodeColorForState(base, { dimmed: false, isFocus: true, isNeighbor: false })).toBe(base);
  });

  it('returns neighbor alpha when node is a 1-hop neighbor of focus', () => {
    expect(nodeColorForState(base, { dimmed: false, isFocus: false, isNeighbor: true })).toBe(
      withAlpha(base, NEIGHBOR_NODE_ALPHA),
    );
  });

  it('returns dimmed alpha when another node is focused and this node is dimmed', () => {
    expect(nodeColorForState(base, { dimmed: true, isFocus: false, isNeighbor: false })).toBe(
      withAlpha(base, DIMMED_ALPHA),
    );
  });
});

describe('targetAlphaForState', () => {
  it('matches nodeColorForState\'s own priority — dimmed beats focus beats neighbor beats rest', () => {
    expect(targetAlphaForState({ dimmed: true, isFocus: true, isNeighbor: true })).toBe(DIMMED_ALPHA);
    expect(targetAlphaForState({ dimmed: false, isFocus: true, isNeighbor: true })).toBe(1);
    expect(targetAlphaForState({ dimmed: false, isFocus: false, isNeighbor: true })).toBe(
      NEIGHBOR_NODE_ALPHA,
    );
    expect(targetAlphaForState({ dimmed: false, isFocus: false, isNeighbor: false })).toBe(
      DEFAULT_NODE_ALPHA,
    );
  });
});

describe('AlphaRampTracker', () => {
  it('lands immediately on the first call — first paint never ramps from nothing', () => {
    const tracker = new AlphaRampTracker();
    expect(tracker.valueFor('n', DEFAULT_NODE_ALPHA, DEFAULT_NODE_ALPHA, 0)).toBeCloseTo(
      DEFAULT_NODE_ALPHA,
    );
    expect(tracker.animating).toBe(false);
  });

  it('ramps toward a new target instead of snapping, and lands exactly on it', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('n', DEFAULT_NODE_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    // The call whose target FIRST differs starts the tween and reports its
    // own starting point (`restValue`) — the interpolated middle only shows
    // up on a LATER call, once time has actually passed since that start.
    const start = tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 10, 100);
    expect(start).toBeCloseTo(DEFAULT_NODE_ALPHA);
    expect(tracker.animating).toBe(true);

    const mid = tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 60, 100);
    expect(mid).toBeGreaterThan(DIMMED_ALPHA);
    expect(mid).toBeLessThan(DEFAULT_NODE_ALPHA);
    expect(tracker.animating).toBe(true);

    const landed = tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 110, 100);
    expect(landed).toBeCloseTo(DIMMED_ALPHA);
    expect(tracker.animating).toBe(false);
  });

  it('retains a resting value off the rest identity so a later idle call still reports it', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // lands
    expect(tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 500, 100)).toBeCloseTo(
      DIMMED_ALPHA,
    );
  });

  it('forgets an id once it lands back at its own rest identity', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // lands dimmed
    tracker.valueFor('n', DEFAULT_NODE_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // starts back to rest
    tracker.valueFor('n', DEFAULT_NODE_ALPHA, DEFAULT_NODE_ALPHA, 200, 100); // lands at rest
    expect(tracker.animating).toBe(false);
    // No stale "dimmed" bookkeeping left for 'n' — a later call with a NEW
    // target starts its fresh ramp from `restValue`, not from the old
    // dimmed value, which is what "forgotten" means here.
    expect(tracker.valueFor('n', NEIGHBOR_NODE_ALPHA, DEFAULT_NODE_ALPHA, 600, 100)).toBeCloseTo(
      DEFAULT_NODE_ALPHA,
    );
  });

  it('retargeting mid-flight continues from the current interpolated value, not the old tween\'s start', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    const before = tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 50, 100);
    const after = tracker.valueFor('n', NEIGHBOR_NODE_ALPHA, DEFAULT_NODE_ALPHA, 50, 100);
    expect(after).toBeCloseTo(before);
  });

  it('a duration of 0 lands immediately — the paused / reduced-motion snap', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('n', DEFAULT_NODE_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    expect(tracker.valueFor('n', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 10, 0)).toBeCloseTo(DIMMED_ALPHA);
    expect(tracker.animating).toBe(false);
  });

  it('activeIds() names only ids currently mid-ramp, not resting ones', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('a', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    tracker.valueFor('a', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // lands, rests dimmed
    tracker.valueFor('b', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // starts ramping
    expect([...tracker.activeIds()]).toEqual(['b']);
  });

  it('clear() drops tweens and resting values alike — a post-clear call starts fresh from restValue', () => {
    const tracker = new AlphaRampTracker();
    tracker.valueFor('a', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 0, 100);
    tracker.valueFor('a', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 100, 100); // lands, rests dimmed
    tracker.clear();
    expect(tracker.animating).toBe(false);
    expect([...tracker.activeIds()]).toEqual([]);
    // No memory of the old dimmed resting value — starts a fresh ramp FROM
    // restValue rather than resuming from where it was before `clear()`.
    expect(tracker.valueFor('a', DIMMED_ALPHA, DEFAULT_NODE_ALPHA, 200, 100)).toBeCloseTo(
      DEFAULT_NODE_ALPHA,
    );
    expect(tracker.animating).toBe(true);
  });
});

