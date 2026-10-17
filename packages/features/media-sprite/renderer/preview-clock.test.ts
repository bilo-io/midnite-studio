import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { previewClock } from './preview-clock';

describe('previewClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Drives the clock from fake timers the way requestAnimationFrame would, one tick per 10 ms. */
  function play(clock: ReturnType<typeof previewClock>, ms: number): number {
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      clock.step(now - last);
      last = now;
    }, 10);
    vi.advanceTimersByTime(ms);
    clearInterval(timer);
    return clock.frame;
  }

  it('at 10 fps, 250 ms of steps lands on frame 2', () => {
    expect(play(previewClock({ frames: 8, fps: 10, loop: 'loop' }), 250)).toBe(2);
  });

  it('wraps a loop and honours the fps override', () => {
    expect(play(previewClock({ frames: 4, fps: 10, loop: 'loop' }), 450)).toBe(0);
    expect(play(previewClock({ frames: 8, fps: 10, loop: 'loop' }, 20), 250)).toBe(5);
  });

  it('once stops on the last frame', () => {
    const clock = previewClock({ frames: 3, fps: 10, loop: 'once' });
    expect(play(clock, 1000)).toBe(2);
    expect(clock.running).toBe(false);
    clock.reset();
    expect(clock.running).toBe(true);
    expect(clock.frame).toBe(0);
  });

  it('ping-pong reverses at each end', () => {
    const clock = previewClock({ frames: 3, fps: 10, loop: 'ping-pong' });
    const seen = [clock.frame];
    for (let i = 0; i < 6; i += 1) seen.push(clock.step(100));
    expect(seen).toEqual([0, 1, 2, 1, 0, 1, 2]);
  });

  it('seek clamps into the clip', () => {
    const clock = previewClock({ frames: 4, fps: 8, loop: 'loop' });
    expect(clock.seek(9)).toBe(3);
    expect(clock.seek(-1)).toBe(0);
  });
});
