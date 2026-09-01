import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTerminalStore } from './terminal-store';
import { useAgentActivity } from './use-agent-activity';

/**
 * The window-lifetime `pty:activity` subscription: events name a ptyId, the
 * store keys by sessionId, and this hook is the one place that translation
 * happens now that `use-terminal-ipc` (per-TerminalView, unmounts with the
 * panel) no longer subscribes.
 */
describe('useAgentActivity', () => {
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useTerminalStore.setState({ ptyIds: {}, activity: {}, activityAt: {} });
  });

  const mockBridge = () => {
    let handler: ((e: { ptyId: string; activity: string | null }) => void) | undefined;
    const unsubscribe = vi.fn();
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      pty: {
        onActivity: (h: typeof handler) => {
          handler = h;
          return unsubscribe;
        },
      },
    };
    return { emit: (e: { ptyId: string; activity: string | null }) => handler?.(e), unsubscribe };
  };

  it('routes an event to the session bound to that pty', () => {
    const { emit } = mockBridge();
    useTerminalStore.setState({ ptyIds: { 's-1': 'pty-1' } });

    renderHook(() => useAgentActivity());
    emit({ ptyId: 'pty-1', activity: 'thinking' });

    expect(useTerminalStore.getState().activity['s-1']).toBe('thinking');
  });

  it('drops an event for a pty no session is bound to', () => {
    const { emit } = mockBridge();

    renderHook(() => useAgentActivity());
    emit({ ptyId: 'pty-ghost', activity: 'waiting' });

    expect(useTerminalStore.getState().activity).toEqual({});
  });

  it('clears the guess on the detector’s explicit null', () => {
    const { emit } = mockBridge();
    useTerminalStore.setState({ ptyIds: { 's-1': 'pty-1' } });

    renderHook(() => useAgentActivity());
    emit({ ptyId: 'pty-1', activity: 'thinking' });
    emit({ ptyId: 'pty-1', activity: null });

    expect(useTerminalStore.getState().activity['s-1']).toBeUndefined();
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = mockBridge();
    const { unmount } = renderHook(() => useAgentActivity());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
