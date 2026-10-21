import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLoopingTypewriter } from './use-looping-typewriter';

describe('useLoopingTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('types text character by character', () => {
    const { result } = renderHook(() => useLoopingTypewriter('Loading', { charDelayMs: 50 }));

    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('L');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('Lo');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('Loadin');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('Loading');
  });

  it('holds the full text before erasing', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type "Hi"
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('Hi');

    // Hold for 100ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('Hi');
  });

  it('erases text after holding', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type "Hi"
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('Hi');

    // Hold
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('Hi');

    // Start erasing
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('H');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('');
  });

  it('loops back to typing after pause', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type -> Hold -> Erase -> Pause -> Type again
    act(() => {
      vi.advanceTimersByTime(100);
    }); // Type "Hi"
    expect(result.current).toBe('Hi');

    act(() => {
      vi.advanceTimersByTime(100);
    }); // Hold
    act(() => {
      vi.advanceTimersByTime(100);
    }); // Erase
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(50);
    }); // Pause
    expect(result.current).toBe('');

    // Should be typing again
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('H');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('Hi');
  });

  it('restarts typing from the top on text change', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useLoopingTypewriter(text, { charDelayMs: 50 }),
      { initialProps: { text: 'Loading' } },
    );

    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(150);
    }); // Partially typed
    expect(result.current).toBe('Loa');

    // Change text mid-animation: the new text starts typing from the top
    rerender({ text: 'Ready' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('R');
  });

  it('shows full text immediately when text is empty', () => {
    const { result } = renderHook(() => useLoopingTypewriter('', { charDelayMs: 50 }));
    expect(result.current).toBe('');
  });

  it('handles custom char delay', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('AB', { charDelayMs: 100, holdMs: 50, pauseMs: 50 }),
    );

    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('A');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('AB');
  });
});
