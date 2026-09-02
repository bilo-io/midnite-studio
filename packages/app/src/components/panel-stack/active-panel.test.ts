import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activePanelBack, activePanelForward, useRegisterActivePanel } from './active-panel';
import { usePanelHistory } from './use-panel-history';

describe('active-panel registry', () => {
  afterEach(() => {
    // Every test that registers must also unmount, but be defensive: a
    // leaked registration would make the *next* test's no-op assertion lie.
    activePanelBack();
    activePanelForward();
  });

  it('is a safe no-op with nothing registered', () => {
    expect(() => activePanelBack()).not.toThrow();
    expect(() => activePanelForward()).not.toThrow();
  });

  it('routes to the registered panel while it is active', () => {
    const { result: historyResult } = renderHook(() => usePanelHistory('a'));
    act(() => historyResult.current.push('b'));

    const { unmount } = renderHook(() => useRegisterActivePanel(historyResult.current, true));

    act(() => activePanelBack());
    expect(historyResult.current.current).toBe('a');

    act(() => activePanelForward());
    expect(historyResult.current.current).toBe('b');

    unmount();
  });

  it('does not register while isActive is false', () => {
    const { result: historyResult } = renderHook(() => usePanelHistory('a'));
    act(() => historyResult.current.push('b'));

    renderHook(() => useRegisterActivePanel(historyResult.current, false));

    act(() => activePanelBack());
    // Nothing registered, so the current entry is untouched.
    expect(historyResult.current.current).toBe('b');
  });

  it('unregisters on unmount, so a later chord is a no-op again', () => {
    const { result: historyResult } = renderHook(() => usePanelHistory('a'));
    act(() => historyResult.current.push('b'));

    const { unmount } = renderHook(() => useRegisterActivePanel(historyResult.current, true));
    unmount();

    act(() => activePanelBack());
    expect(historyResult.current.current).toBe('b');
  });

  it('a second panel registering takes over from the first', () => {
    const back = vi.fn();
    const forward = vi.fn();
    const { unmount: unmount1 } = renderHook(() =>
      useRegisterActivePanel({ back, forward } as never, true),
    );

    const back2 = vi.fn();
    const forward2 = vi.fn();
    renderHook(() => useRegisterActivePanel({ back: back2, forward: forward2 } as never, true));

    act(() => activePanelBack());
    expect(back).not.toHaveBeenCalled();
    expect(back2).toHaveBeenCalledOnce();

    unmount1();
  });
});
