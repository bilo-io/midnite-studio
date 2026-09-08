import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useMarqueeCycle,
  type MarqueeCycle,
  type UseMarqueeCycleOptions,
} from './use-marquee-cycle';

/**
 * A probe component, so the hook can be driven without a testing-library
 * `renderHook` dependency the site does not have.
 */
const probe = (options: UseMarqueeCycleOptions) => {
  const seen: MarqueeCycle[] = [];
  const Probe = (props: UseMarqueeCycleOptions) => {
    seen.push(useMarqueeCycle(props));
    return null;
  };
  const view = render(createElement(Probe, options));
  return {
    seen,
    /** The selected index, which is what most of these assertions are about. */
    latest: () => seen.at(-1)?.selected,
    typed: () => seen.at(-1)?.typed,
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

  describe('the caption', () => {
    const CAPTIONS = ['Claude', 'Antigravity', 'Codex', 'Cursor'] as const;
    const options = { count: 4, periodMs: PERIOD, captions: CAPTIONS };

    /*
      Advance in small chunks, each its own `act`, and keep every frame.

      One big `advanceTimersByTime` will not do: React coalesces every state
      update made inside a single `act` into one render, so a probe would see
      the last value and nothing in between — which is exactly the part of a
      typing animation worth asserting on.
    */
    const sample = (totalMs: number, stepMs = 20) => {
      const frames: MarqueeCycle[] = [];
      const view = probe(options);
      frames.push({ selected: view.latest()!, typed: view.typed()! });
      for (let t = 0; t < totalMs; t += stepMs) {
        act(() => void vi.advanceTimersByTime(stepMs));
        frames.push({ selected: view.latest()!, typed: view.typed()! });
      }
      return frames;
    };

    it('types nothing at all when no captions are given', () => {
      const { typed } = probe({ count: 4, periodMs: PERIOD });
      act(() => void vi.advanceTimersByTime(PERIOD * 2));
      expect(typed()).toBe(0);
    });

    it('types the first name from empty, rather than opening mid-word', () => {
      // Selection 0's boundary is half a period before the timeline starts, so
      // its pass is clamped to begin at zero — see the hook.
      const { typed } = probe(options);
      expect(typed()).toBe(0);

      act(() => void vi.advanceTimersByTime(70));
      expect(typed()).toBe(1);
      act(() => void vi.advanceTimersByTime(62 * 3));
      expect(typed()).toBe(4);
    });

    it('has the whole name up by the time the logo reaches the centre', () => {
      // A tick short of the handover: at exactly `PERIOD / 2` the next logo is
      // already selected, since selection leads the geometric centre.
      const { latest, typed } = probe(options);
      act(() => void vi.advanceTimersByTime(PERIOD / 2 - 1));
      expect(latest()).toBe(0);
      expect(typed()).toBe('Claude'.length);

      // And the second logo starts its own name from empty on the handover.
      act(() => void vi.advanceTimersByTime(1));
      expect(latest()).toBe(1);
      expect(typed()).toBe(0);
    });

    it('never spells one agent`s name while another holds the centre', () => {
      /*
        The whole reason the caption is on this hook rather than in a
        `<Typewriter>` of its own: one clock cannot disagree with itself. A
        second timeline would eventually show the previous agent's name under a
        new logo, and the seam is exactly at the handover.
      */
      for (const { selected, typed } of sample(PERIOD * 4)) {
        expect(typed).toBeLessThanOrEqual(CAPTIONS[selected]!.length);
      }
    });

    it('empties the caption again before the next logo takes over', () => {
      const frames = sample(PERIOD * 4);

      // Every selection has frames with nothing typed — the blank beat, which
      // is what makes a handover read as a hand-off rather than a substitution.
      for (const index of [0, 1, 2, 3]) {
        const mine = frames.filter((frame) => frame.selected === index);
        expect(mine.length, `logo ${index} seen`).toBeGreaterThan(0);
        expect(
          mine.some((frame) => frame.typed === 0),
          `logo ${index} empties`,
        ).toBe(true);
        expect(
          mine.some((frame) => frame.typed === CAPTIONS[index]!.length),
          `logo ${index} completes`,
        ).toBe(true);
      }
    });

    it('freezes the caption with the rest of the timeline while paused', () => {
      const { typed, rerender } = probe(options);
      act(() => void vi.advanceTimersByTime(250));
      const frozen = typed();
      expect(frozen).toBeGreaterThan(0);

      rerender({ ...options, paused: true });
      act(() => void vi.advanceTimersByTime(PERIOD * 5));
      expect(typed()).toBe(frozen);
    });
  });

  it('stays on the first logo for a degenerate roster', () => {
    const { latest } = probe({ count: 0, periodMs: PERIOD });
    act(() => void vi.advanceTimersByTime(PERIOD * 4));
    expect(latest()).toBe(0);
  });
});
