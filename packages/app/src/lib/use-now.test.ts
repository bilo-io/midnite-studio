import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __nowSubscriberCount, __nowTimerCount, useNow } from './use-now';

/**
 * Phase 36 E — the properties that make this worth having over three local
 * `setInterval`s: one timer no matter how many consumers, and no timer at all
 * while the document is hidden.
 */

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  // Through `act`: the visibility handler pushes a new time into the store,
  // and React must flush that before an assertion reads the rendered value.
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Advance fake time and let React commit whatever the tick notified. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs exactly one timer for three consumers', () => {
    const a = renderHook(() => useNow());
    const b = renderHook(() => useNow());
    const c = renderHook(() => useNow());

    expect(__nowSubscriberCount()).toBe(3);
    expect(__nowTimerCount()).toBe(1);

    a.unmount();
    b.unmount();
    c.unmount();
  });

  it('holds no timer once the last consumer unmounts', () => {
    const { unmount } = renderHook(() => useNow());
    expect(__nowTimerCount()).toBe(1);

    unmount();

    expect(__nowSubscriberCount()).toBe(0);
    expect(__nowTimerCount()).toBe(0);
  });

  it('stops ticking while the document is hidden', () => {
    const { unmount } = renderHook(() => useNow());
    expect(__nowTimerCount()).toBe(1);

    setVisibility('hidden');

    expect(__nowTimerCount()).toBe(0);

    unmount();
  });

  it('re-arms and snaps forward when the document comes back', () => {
    const { result, unmount } = renderHook(() => useNow());
    setVisibility('hidden');

    // Time passes with the window hidden and no timer running.
    advance(60_000);
    const whileHidden = result.current;

    setVisibility('visible');

    expect(__nowTimerCount()).toBe(1);
    expect(result.current.getTime()).toBeGreaterThan(whileHidden.getTime());

    unmount();
  });

  it('advances on the tick and keeps a stable Date between ticks', () => {
    const { result, unmount } = renderHook(() => useNow());
    const first = result.current;

    // Same object identity until a tick actually fires.
    expect(result.current).toBe(first);

    advance(1_100);

    expect(result.current.getTime()).toBeGreaterThan(first.getTime());

    unmount();
  });

  it('sleeps only to the next second boundary, not a full second', () => {
    vi.setSystemTime(new Date('2026-09-01T12:00:00.800Z'));

    const { result, unmount } = renderHook(() => useNow());
    const first = result.current;

    // 200ms remain in the current second — an unaligned interval would still
    // be 800ms from firing here.
    advance(250);

    expect(result.current.getTime()).toBeGreaterThan(first.getTime());

    unmount();
  });
});
