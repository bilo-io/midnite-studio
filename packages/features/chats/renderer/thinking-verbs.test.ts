import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THINKING_VERBS, useThinkingVerb } from './thinking-verbs';

// vitest/jsdom: the verb list's derivation and the cycler's timing, on fake timers.

describe('THINKING_VERBS', () => {
  it('is single capitalised -ing words drawn from the screensaver', () => {
    expect(THINKING_VERBS.length).toBeGreaterThan(20);
    for (const verb of THINKING_VERBS) expect(verb).toMatch(/^[A-Z][a-z]+ing$/);
    expect(THINKING_VERBS).toEqual(expect.arrayContaining(['Pondering', 'Cogitating', 'Midnighting']));
    // Multi-word quips stay on the screensaver.
    expect(THINKING_VERBS.some((v) => v.includes(' '))).toBe(false);
  });
});

describe('useThinkingVerb', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cycles to a different verb each interval while active', () => {
    const { result } = renderHook(() => useThinkingVerb(true, 1000));
    const first = result.current;
    expect(THINKING_VERBS).toContain(first);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).not.toBe(first);
    expect(THINKING_VERBS).toContain(result.current);
  });

  it('stops on its last verb once the turn is no longer active', () => {
    const { result, rerender } = renderHook(({ active }) => useThinkingVerb(active, 1000), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(1000));
    rerender({ active: false });
    const settled = result.current;
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(settled);
  });
});
