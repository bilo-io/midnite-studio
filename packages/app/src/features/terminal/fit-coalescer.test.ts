import { describe, expect, it, vi } from 'vitest';

import { createFitCoalescer } from './fit-coalescer';

/**
 * A manually-stepped `requestAnimationFrame` — real rAF fires on the
 * browser's own clock, which a test cannot control or observe
 * deterministically. `flush()` runs whichever callback is currently pending,
 * exactly like one real frame elapsing.
 */
function fakeRaf() {
  let pending: FrameRequestCallback | null = null;
  let nextHandle = 1;
  const raf = vi.fn((callback: FrameRequestCallback) => {
    pending = callback;
    return nextHandle++;
  });
  const cancelRaf = vi.fn(() => {
    pending = null;
  });
  const flush = () => {
    const callback = pending;
    pending = null;
    callback?.(0);
  };
  return { raf, cancelRaf, flush, isPending: () => pending !== null };
}

describe('createFitCoalescer', () => {
  it('coalesces N schedules within one frame into a single fit', () => {
    const fit = vi.fn();
    const { raf, cancelRaf, flush } = fakeRaf();
    const coalescer = createFitCoalescer(fit, raf, cancelRaf);

    coalescer.schedule();
    coalescer.schedule();
    coalescer.schedule();
    expect(fit).not.toHaveBeenCalled();

    flush();
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending fit without running it', () => {
    const fit = vi.fn();
    const { raf, cancelRaf, flush, isPending } = fakeRaf();
    const coalescer = createFitCoalescer(fit, raf, cancelRaf);

    coalescer.schedule();
    coalescer.cancel();
    expect(isPending()).toBe(false);

    flush();
    expect(fit).not.toHaveBeenCalled();
  });

  it('cancel is a no-op with nothing pending', () => {
    const fit = vi.fn();
    const { raf, cancelRaf } = fakeRaf();
    const coalescer = createFitCoalescer(fit, raf, cancelRaf);

    expect(() => coalescer.cancel()).not.toThrow();
    expect(cancelRaf).not.toHaveBeenCalled();
  });

  it('still fits for the final observation after a burst, and keeps fitting on later frames', () => {
    const fit = vi.fn();
    const { raf, cancelRaf, flush } = fakeRaf();
    const coalescer = createFitCoalescer(fit, raf, cancelRaf);

    // Burst 1 — several observations, one frame.
    coalescer.schedule();
    coalescer.schedule();
    flush();
    expect(fit).toHaveBeenCalledTimes(1);

    // Burst 2 — a second, independent frame is not throttled away by the first.
    coalescer.schedule();
    coalescer.schedule();
    coalescer.schedule();
    flush();
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it('re-scheduling within the same frame cancels the previous rAF handle, not just the callback', () => {
    const fit = vi.fn();
    const { raf, cancelRaf, flush } = fakeRaf();
    const coalescer = createFitCoalescer(fit, raf, cancelRaf);

    coalescer.schedule();
    coalescer.schedule();

    expect(raf).toHaveBeenCalledTimes(2);
    expect(cancelRaf).toHaveBeenCalledTimes(1);
    expect(cancelRaf).toHaveBeenCalledWith(1);

    flush();
    expect(fit).toHaveBeenCalledTimes(1);
  });
});
