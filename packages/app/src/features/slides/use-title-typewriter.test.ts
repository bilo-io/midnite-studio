import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTitleTypewriter } from './use-title-typewriter';

describe('useTitleTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts as not-done on the very first render, before any timer has fired', () => {
    // Regression: `done` used to default to `true` until the effect ran,
    // so a keydown landing in that gap read a mid-typing title as finished.
    const { result } = renderHook(() => useTitleTypewriter('Hi', false));
    expect(result.current.done).toBe(false);
    expect(result.current.typed).toBe('');
  });

  it('types the title out one character at a time', () => {
    const { result } = renderHook(() => useTitleTypewriter('Hi', false));
    expect(result.current.typed).toBe('');
    expect(result.current.done).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.typed).toBe('Hi');
    expect(result.current.done).toBe(true);
  });

  it('shows the full title instantly when instant is true', () => {
    const { result } = renderHook(() => useTitleTypewriter('Instant', true));
    expect(result.current.typed).toBe('Instant');
    expect(result.current.done).toBe(true);
  });

  it('restarts typing when the title changes', () => {
    const { result, rerender } = renderHook(({ title }) => useTitleTypewriter(title, false), {
      initialProps: { title: 'First' },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.typed).toBe('First');

    rerender({ title: 'Second' });
    expect(result.current.typed).toBe('');
    expect(result.current.done).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.typed).toBe('Second');
  });

  it('complete() snaps to the full title and stops the timer', () => {
    const { result } = renderHook(() => useTitleTypewriter('Snap to it', false));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current.done).toBe(false);
    act(() => {
      result.current.complete();
    });
    expect(result.current.typed).toBe('Snap to it');
    expect(result.current.done).toBe(true);
  });

  it('an empty title is immediately done', () => {
    const { result } = renderHook(() => useTitleTypewriter('', false));
    expect(result.current.typed).toBe('');
    expect(result.current.done).toBe(true);
  });
});
