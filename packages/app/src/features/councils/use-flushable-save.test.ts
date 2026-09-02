import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlushableSave } from './use-flushable-save';

describe('useFlushableSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls save after the debounce delay', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useFlushableSave(save, 500));

    act(() => result.current.schedule('a'));
    expect(save).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('restarts the timer on a second schedule before the delay elapses', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useFlushableSave(save, 500));

    act(() => result.current.schedule('a'));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.schedule('b'));
    act(() => vi.advanceTimersByTime(300));
    expect(save).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(save).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('unmounting before the timer fires still flushes exactly once, with the last value', () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() => useFlushableSave(save, 500));

    act(() => result.current.schedule('a'));
    act(() => result.current.schedule('b'));
    unmount();

    expect(save).toHaveBeenCalledExactlyOnceWith('b');

    // Advancing time after unmount must not call it again — the timer was
    // cleared, not merely raced.
    act(() => vi.advanceTimersByTime(1000));
    expect(save).toHaveBeenCalledOnce();
  });

  it('unmounting with nothing scheduled does not call save', () => {
    const save = vi.fn();
    const { unmount } = renderHook(() => useFlushableSave(save, 500));

    unmount();

    expect(save).not.toHaveBeenCalled();
  });

  it('a save already delivered by its own timer is not delivered again on unmount', () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() => useFlushableSave(save, 500));

    act(() => result.current.schedule('a'));
    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledExactlyOnceWith('a');

    unmount();
    expect(save).toHaveBeenCalledOnce();
  });
});
