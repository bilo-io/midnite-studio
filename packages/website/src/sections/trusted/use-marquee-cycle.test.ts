import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMarqueeCycle, type UseMarqueeCycleOptions } from './use-marquee-cycle';

/**
 * A probe component, so the hook can be driven without a testing-library
 * `renderHook` dependency the site does not have.
 */
const probe = (options: UseMarqueeCycleOptions) => {
  const seen: number[] = [];
  const Probe = (props: UseMarqueeCycleOptions) => {
    seen.push(useMarqueeCycle(props));
    return null;
  };
  const view = render(createElement(Probe, options));
  return {
    seen,
    latest: () => seen.at(-1),
    rerender: (next: UseMarqueeCycleOptions) =>
      view.rerender(createElement(Probe, next)),
  };
};

const PERIOD = 1000;

describe('useMarqueeCycle', () => {
  beforeEach(() => {
    // Both the fake timers and `performance.now()` have to move together, or
    // the hook reads a frozen clock and every tick computes step 0.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the first logo', () => {
    const { latest } = probe({ count: 4, periodMs: PERIOD });
    expect(latest()).toBe(0);
  });

  it('advances one logo per period', () => {
    const { latest } = probe({ count: 4, periodMs: PERIOD });

    // The first selection lands half a period early (the animation has to be
    // running by the time the logo reaches the centre), so the first advance
    // comes after half a period and every one after that a full period later.
    act(() => void vi.advanceTimersByTime(PERIOD / 2 + 1));
    expect(latest()).toBe(1);

    act(() => void vi.advanceTimersByTime(PERIOD));
    expect(latest()).toBe(2);

    act(() => void vi.advanceTimersByTime(PERIOD));
    expect(latest()).toBe(3);
  });

  it('wraps back to the first logo after a full pass', () => {
    const { latest } = probe({ count: 3, periodMs: PERIOD });
    act(() => void vi.advanceTimersByTime(PERIOD * 3));
    expect(latest()).toBe(0);
  });

  it('holds its place while paused and resumes from there', () => {
    const { latest, rerender } = probe({ count: 5, periodMs: PERIOD });

    act(() => void vi.advanceTimersByTime(PERIOD / 2 + 1));
    expect(latest()).toBe(1);

    rerender({ count: 5, periodMs: PERIOD, paused: true });
    // A pause has to freeze the timeline, not merely stop the ticks: ten
    // periods of wall clock must not be counted when the marquee resumes.
    act(() => void vi.advanceTimersByTime(PERIOD * 10));
    expect(latest()).toBe(1);

    rerender({ count: 5, periodMs: PERIOD, paused: false });
    act(() => void vi.advanceTimersByTime(PERIOD));
    expect(latest()).toBe(2);
  });

  it('never schedules a zero-delay loop, however overdue a tick is', () => {
    const spy = vi.spyOn(window, 'setTimeout');
    probe({ count: 3, periodMs: 1 });
    act(() => void vi.advanceTimersByTime(500));
    const delays = spy.mock.calls.map((call) => call[1]);
    expect(delays.length).toBeGreaterThan(0);
    for (const delay of delays) expect(delay).toBeGreaterThanOrEqual(16);
    spy.mockRestore();
  });

  it('stays on the first logo for a degenerate roster', () => {
    const { latest } = probe({ count: 0, periodMs: PERIOD });
    act(() => void vi.advanceTimersByTime(PERIOD * 4));
    expect(latest()).toBe(0);
  });
});
