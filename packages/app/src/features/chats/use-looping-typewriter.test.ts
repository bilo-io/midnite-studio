import { renderHook } from '@testing-library/react';
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

    vi.advanceTimersByTime(50);
    expect(result.current).toBe('L');

    vi.advanceTimersByTime(50);
    expect(result.current).toBe('Lo');

    vi.advanceTimersByTime(250);
    expect(result.current).toBe('Loadin');

    vi.advanceTimersByTime(50);
    expect(result.current).toBe('Loading');
  });

  it('holds the full text before erasing', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type "Hi"
    vi.advanceTimersByTime(100);
    expect(result.current).toBe('Hi');

    // Hold for 100ms
    vi.advanceTimersByTime(100);
    expect(result.current).toBe('Hi');
  });

  it('erases text after holding', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type "Hi"
    vi.advanceTimersByTime(100);
    expect(result.current).toBe('Hi');

    // Hold
    vi.advanceTimersByTime(100);
    expect(result.current).toBe('Hi');

    // Start erasing
    vi.advanceTimersByTime(50);
    expect(result.current).toBe('H');

    vi.advanceTimersByTime(50);
    expect(result.current).toBe('');
  });

  it('loops back to typing after pause', () => {
    const { result } = renderHook(() =>
      useLoopingTypewriter('Hi', { charDelayMs: 50, holdMs: 100, pauseMs: 50 }),
    );

    // Type -> Hold -> Erase -> Pause -> Type again
    vi.advanceTimersByTime(100); // Type "Hi"
    expect(result.current).toBe('Hi');

    vi.advanceTimersByTime(100); // Hold
    vi.advanceTimersByTime(100); // Erase
    expect(result.current).toBe('');

    vi.advanceTimersByTime(50); // Pause
    expect(result.current).toBe('');

    // Should be typing again
    vi.advanceTimersByTime(50);
    expect(result.current).toBe('H');

    vi.advanceTimersByTime(50);
    expect(result.current).toBe('Hi');
  });

  it('shows full text immediately on text change', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useLoopingTypewriter(text, { charDelayMs: 50 }),
      { initialProps: { text: 'Loading' } },
    );

    expect(result.current).toBe('');

    vi.advanceTimersByTime(150); // Partially typed
    expect(result.current).toBe('Loa');

    // Change text mid-animation
    rerender({ text: 'Ready' });
    expect(result.current).toBe('Ready');
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

    vi.advanceTimersByTime(100);
    expect(result.current).toBe('A');

    vi.advanceTimersByTime(100);
    expect(result.current).toBe('AB');
  });
});
