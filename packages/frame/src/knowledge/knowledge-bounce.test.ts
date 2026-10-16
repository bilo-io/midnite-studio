// Layer: vitest — pure math and bookkeeping with an injected clock, no rAF (see knowledge-bounce.ts).
import { describe, expect, it } from 'vitest';

import { PULSES, PulseTracker, bounceScale, easeOutBack } from './knowledge-bounce';

describe('easeOutBack', () => {
  it('starts at 0 and lands exactly on 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it('overshoots past 1 on the way — that is the bounce', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('a zero overshoot is a plain ease-out that never passes 1', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100, 0)));
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('bounceScale', () => {
  it('interpolates from → to, clamping t outside 0..1', () => {
    expect(bounceScale(0, 1, 1.25)).toBeCloseTo(1);
    expect(bounceScale(1, 1, 1.25)).toBeCloseTo(1.25);
    expect(bounceScale(-1, 1, 1.25)).toBeCloseTo(1);
    expect(bounceScale(2, 1, 1.25)).toBeCloseTo(1.25);
  });

  it('shrinking tweens bounce too (dip below the target, then settle)', () => {
    const samples = Array.from({ length: 101 }, (_, i) => bounceScale(i / 100, 1.25, 1));
    expect(Math.min(...samples)).toBeLessThan(1);
    expect(samples[100]).toBeCloseTo(1);
  });
});

describe('PulseTracker', () => {
  it('is empty and idle until something starts', () => {
    const tracker = new PulseTracker();
    const sample = tracker.sample(0);
    expect(sample.scales.size).toBe(0);
    expect(sample.finished).toEqual([]);
    expect(sample.animating).toBe(false);
  });

  it('reports a mid-flight scale, then settles at the target and rests there when it is not 1', () => {
    const tracker = new PulseTracker();
    tracker.start('n', 0, { to: 1.25, durationMs: 100 });

    const mid = tracker.sample(50);
    expect(mid.animating).toBe(true);
    expect(mid.scales.get('n')).not.toBeCloseTo(1, 5);

    const done = tracker.sample(100);
    expect(done.animating).toBe(false);
    expect(done.finished).toEqual([]);
    expect(done.scales.get('n')).toBeCloseTo(1.25);
    // Resting scales persist across later samples so the reducer keeps multiplying.
    expect(tracker.sample(500).scales.get('n')).toBeCloseTo(1.25);
  });

  it('a tween landing on 1 reports finished once and is then forgotten', () => {
    const tracker = new PulseTracker();
    tracker.start('n', 0, { to: 1.25, durationMs: 100 });
    tracker.sample(100);
    tracker.start('n', 100, { to: 1, durationMs: 100 });

    const done = tracker.sample(200);
    expect(done.finished).toEqual(['n']);
    expect(done.scales.has('n')).toBe(false);
    expect(tracker.sample(300).finished).toEqual([]);
    expect(tracker.size).toBe(0);
  });

  it('restarting mid-flight continues from the current scale rather than snapping', () => {
    const tracker = new PulseTracker();
    tracker.start('n', 0, { to: 2, durationMs: 100 });
    const before = tracker.currentScale('n', 50);
    tracker.start('n', 50, { to: 1, durationMs: 100 });
    expect(tracker.currentScale('n', 50)).toBeCloseTo(before);
  });

  it('a zero duration lands immediately — the paused-window snap', () => {
    const tracker = new PulseTracker();
    tracker.start('n', 0, { to: 1.25, durationMs: 0 });
    expect(tracker.currentScale('n', 0)).toBeCloseTo(1.25);
    expect(tracker.sample(0).animating).toBe(false);
  });

  it('clear() drops tweens and resting scales alike', () => {
    const tracker = new PulseTracker();
    tracker.start('a', 0, { to: 1.25, durationMs: 100 });
    tracker.start('b', 0, { to: 1.25, durationMs: 0 });
    tracker.sample(0);
    tracker.clear();
    expect(tracker.size).toBe(0);
    expect(tracker.sample(50).scales.size).toBe(0);
  });
});

describe('PULSES', () => {
  it('every hover-out preset returns to 1 so nothing is left enlarged', () => {
    expect(PULSES.nodeHoverOut.to).toBe(1);
    expect(PULSES.edgeHoverOut.to).toBe(1);
  });

  it('presets stay short — a reaction, not an animation', () => {
    for (const preset of Object.values(PULSES)) expect(preset.durationMs).toBeLessThanOrEqual(450);
  });
});
