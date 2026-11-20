import { act, renderHook, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './use-reduced-motion';

afterEach(() => vi.restoreAllMocks());

describe('useReducedMotion', () => {
  it('reads the OS setting, follows its change event and unsubscribes', async () => {
    const remove = vi.fn();
    let emit: (on: boolean) => void = () => {};
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, cb: (on: boolean) => void) => {
      expect(name).toBe('reduceMotionChanged');
      emit = cb;
      return { remove };
    }) as never);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => emit(true));
    await waitFor(() => expect(result.current).toBe(true));
    unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('starts true when the OS already asks for it', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
