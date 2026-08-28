import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REVEAL_MS, useReveal, useRevealSize } from './use-reveal';

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

describe('useRevealSize', () => {
  it('produces the same settled style shape for both axes', () => {
    // Settled (the resting state, which an already-open panel starts in) —
    // transitionProperty is 'none' here, exactly like an already-open panel
    // that has never been toggled. See the next test for the armed shape.
    const { result: x } = renderHook(() =>
      useRevealSize({ open: true, size: 240, axis: 'x' }),
    );
    expect(x.current.style).toEqual({
      width: 240,
      transitionProperty: 'none',
      transitionDuration: `${REVEAL_MS}ms`,
      transitionTimingFunction: 'ease-in-out',
    });

    const { result: y } = renderHook(() =>
      useRevealSize({ open: true, size: 300, axis: 'y' }),
    );
    expect(y.current.style).toEqual({
      height: 300,
      transitionProperty: 'none',
      transitionDuration: `${REVEAL_MS}ms`,
      transitionTimingFunction: 'ease-in-out',
    });
  });

  /**
   * The transition is armed only for the length of a genuine toggle — not
   * left permanently on the way the removed `useSettled`'s conditional CLASS
   * never was either. A permanently-armed `transitionProperty` would animate
   * every subsequent value change regardless of what caused it, which is
   * exactly the bug the maximized-terminal case below exists to avoid.
   */
  it('arms the transition only while unsettled, and drops it once settled again', async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useRevealSize({ open, size: 200, axis: 'y' }),
      { initialProps: { open: true } },
    );
    expect(result.current.style.transitionProperty).toBe('none');

    rerender({ open: false });
    expect(result.current.settled).toBe(false);
    expect(result.current.style.transitionProperty).toBe('height');

    await after(REVEAL_MS + 50);
    expect(result.current.settled).toBe(true);
    expect(result.current.style.transitionProperty).toBe('none');
  });

  it('is simply there and settled when it starts open, with no entrance to play', () => {
    const { result } = renderHook(() => useRevealSize({ open: true, size: 200, axis: 'y' }));
    expect(result.current.mounted).toBe(true);
    expect(result.current.shown).toBe(true);
    expect(result.current.settled).toBe(true);
    expect(result.current.settleCount).toBe(0);
  });

  it('settles once per open/close toggle and once per target-size change', async () => {
    const { result, rerender } = renderHook(
      ({ open, size }: { open: boolean; size: number }) =>
        useRevealSize({ open, size, axis: 'y' }),
      { initialProps: { open: true, size: 200 } },
    );

    rerender({ open: false, size: 200 });
    expect(result.current.settled).toBe(false);
    await after(REVEAL_MS + 50);
    expect(result.current.settled).toBe(true);
    expect(result.current.settleCount).toBe(1);

    rerender({ open: true, size: 200 });
    await after(REVEAL_MS + 50);
    expect(result.current.settleCount).toBe(2);

    // Open the whole time — a target-size change alone (restore ↔ maximize).
    rerender({ open: true, size: 400 });
    expect(result.current.settled).toBe(false);
    await after(REVEAL_MS + 50);
    expect(result.current.settled).toBe(true);
    expect(result.current.settleCount).toBe(3);
  });

  it('applies no transition while dragging, and stays settled', () => {
    const { result } = renderHook(() =>
      useRevealSize({ open: true, size: 200, axis: 'x', dragging: true }),
    );
    expect(result.current.style.transitionProperty).toBe('none');
    expect(result.current.settled).toBe(true);
  });

  it('animates a drag release to whatever the drag landed on', async () => {
    const { result, rerender } = renderHook(
      ({ size, dragging }: { size: number; dragging: boolean }) =>
        useRevealSize({ open: true, size, axis: 'x', dragging }),
      { initialProps: { size: 200, dragging: true } },
    );

    rerender({ size: 280, dragging: true });
    expect(result.current.settled).toBe(true);

    rerender({ size: 280, dragging: false });
    expect(result.current.settled).toBe(false);
    await after(REVEAL_MS + 50);
    expect(result.current.settled).toBe(true);
  });

  /**
   * The regression this hook replaced `useSettled` for. `terminalTarget`
   * tracks the window's own live height while the terminal is maximized —
   * a native window resize changes `size` on every tick with no accompanying
   * open/maximize toggle. Keying settle on the default `${open}:${size}`
   * would re-arm the transition on every tick, for as long as the window
   * kept moving, and the terminal's bottom edge would visibly trail the
   * window edge by `motionMs()`. `animateKey` is the caller's way to say
   * "only THIS changing means a real toggle" — a live size change with no
   * change to the key must apply instantly, at any size.
   */
  it('ignores a size change alone when animateKey excludes it, applying it instantly', () => {
    const { result, rerender } = renderHook(
      ({ size, maximized }: { size: number; maximized: boolean }) =>
        useRevealSize({
          open: true,
          size,
          axis: 'y',
          animateKey: `true:${maximized}`,
        }),
      { initialProps: { size: 600, maximized: true } },
    );
    expect(result.current.settled).toBe(true);

    // A live window-resize tick: `size` changes, `maximized` does not.
    rerender({ size: 640, maximized: true });
    expect(result.current.settled).toBe(true);
    expect(result.current.style.transitionProperty).toBe('none');
    expect(result.current.style.height).toBe(640);

    // The discrete toggle `animateKey` actually names DOES still arm it.
    rerender({ size: 200, maximized: false });
    expect(result.current.settled).toBe(false);
    expect(result.current.style.transitionProperty).toBe('height');
  });

  it('collapses to zero duration under reduced motion, settling on the slack alone', async () => {
    document.documentElement.dataset['motion'] = 'reduced';
    try {
      const { result, rerender } = renderHook(
        ({ open }: { open: boolean }) => useRevealSize({ open, size: 200, axis: 'y' }),
        { initialProps: { open: true } },
      );
      expect(result.current.style.transitionDuration).toBe('0ms');

      rerender({ open: false });
      expect(result.current.settled).toBe(false);
      await after(49);
      expect(result.current.settled).toBe(false);
      await after(1);
      expect(result.current.settled).toBe(true);
      expect(result.current.settleCount).toBe(1);
    } finally {
      delete document.documentElement.dataset['motion'];
    }
  });
});
