import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REVEAL_MS, useReveal, useSettled } from './use-reveal';

/** Both animation frames the entrance waits for, plus whatever they schedule. */
const frames = async () => {
  await act(async () => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  });
};

const after = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

/**
 * Hand-driven animation frames, with the timestamp under the test's control.
 *
 * The fake clock cannot express a stalled frame: its `requestAnimationFrame` is
 * a 16ms timer, so every frame it delivers is exactly on time however far the
 * clock is advanced. What the hook reads is the timestamp it is handed, and this
 * is what hands it one.
 */
const manualFrames = () => {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  return async (at: number) => {
    const next = queue.shift();
    expect(next, 'a frame was asked for').toBeTypeOf('function');
    await act(async () => {
      next?.(at);
    });
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useReveal', () => {
  it('is simply there when it starts open, with no entrance to play', async () => {
    const { result } = renderHook(() => useReveal(true));
    expect(result.current).toEqual({ mounted: true, shown: true });

    // And nothing later changes its mind about that.
    await frames();
    expect(result.current).toEqual({ mounted: true, shown: true });
  });

  it('mounts collapsed, then expands a painted frame later', async () => {
    const { result, rerender } = renderHook(({ open }) => useReveal(open), {
      initialProps: { open: false },
    });
    expect(result.current).toEqual({ mounted: false, shown: false });

    rerender({ open: true });
    // Mounted at zero: the frame the transition has to travel FROM.
    expect(result.current).toEqual({ mounted: true, shown: false });

    await frames();
    expect(result.current).toEqual({ mounted: true, shown: true });
  });

  it('holds at zero through a stalled frame, so the entrance has frames to play in', async () => {
    const frame = manualFrames();
    const { result, rerender } = renderHook(({ open }) => useReveal(open), {
      initialProps: { open: false },
    });

    rerender({ open: true });

    // The mount's own frame, and then a main thread that goes away for longer
    // than the animation would have lasted — a panel building an xterm and a
    // WebGL context on arrival.
    await frame(0);
    await frame(300);
    expect(result.current).toEqual({ mounted: true, shown: false });

    // On time, so the thread is free and there are frames left to move in.
    await frame(316);
    expect(result.current).toEqual({ mounted: true, shown: true });
  });

  it('gives up waiting for a quiet frame rather than never arriving', async () => {
    const frame = manualFrames();
    const { result, rerender } = renderHook(({ open }) => useReveal(open), {
      initialProps: { open: false },
    });

    rerender({ open: true });

    // Every frame late, the way a machine under real load reports them.
    for (let at = 0; at < 8; at += 1) await frame(at * 300);
    expect(result.current).toEqual({ mounted: true, shown: true });
  });

  it('collapses first and stays mounted until the exit has run', async () => {
    const { result, rerender } = renderHook(({ open }) => useReveal(open), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, shown: false });

    await after(REVEAL_MS - 1);
    expect(result.current.mounted).toBe(true);

    await after(1);
    expect(result.current).toEqual({ mounted: false, shown: false });
  });

  it('cancels a pending unmount when it is reopened mid-exit', async () => {
    const { result, rerender } = renderHook(({ open }) => useReveal(open), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    await after(REVEAL_MS / 2);
    rerender({ open: true });
    await after(REVEAL_MS);

    expect(result.current).toEqual({ mounted: true, shown: true });
  });
});

describe('useSettled', () => {
  it('starts settled, so nothing animates on the first paint', () => {
    const { result } = renderHook(() => useSettled('normal', 100));
    expect(result.current).toBe(true);
  });

  it('unsettles in the same render as the change, and settles again after', async () => {
    const { result, rerender } = renderHook(({ value }) => useSettled(value, 100), {
      initialProps: { value: 'normal' },
    });

    rerender({ value: 'maximized' });
    expect(result.current).toBe(false);

    await after(99);
    expect(result.current).toBe(false);

    await after(1);
    expect(result.current).toBe(true);
  });

  it('restarts its wait when the value changes again mid-flight', async () => {
    const { result, rerender } = renderHook(({ value }) => useSettled(value, 100), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    await after(80);
    rerender({ value: 'c' });
    await after(80);
    expect(result.current).toBe(false);

    await after(20);
    expect(result.current).toBe(true);
  });
});
