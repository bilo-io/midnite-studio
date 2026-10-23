import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@midnite/studio-frame';
import type { AgentLimitTrip, MidniteStudioBridge } from '@midnite/studio-shared';

import { useAgentLimitToasts } from './use-agent-limit-toasts';

const trip: AgentLimitTrip = {
  id: 'trip-1',
  sessionId: 's1',
  limit: 'toolCallsPerMinute',
  observed: 121,
  threshold: 120,
  message: 'Agent session paused: 121 tool calls per minute (limit 120).',
  at: 1,
};

function installBridge() {
  let listener: ((t: AgentLimitTrip) => void) | null = null;
  const resolve = vi.fn(async () => ({ ok: true as const, value: {} }));
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    agentLimits: {
      onTripped: (handler: (t: AgentLimitTrip) => void) => {
        listener = handler;
        return () => {
          listener = null;
        };
      },
      resolve,
    } as unknown as MidniteStudioBridge['agentLimits'],
  };
  return { emit: (t: AgentLimitTrip) => listener?.(t), resolve };
}

describe('useAgentLimitToasts (Phase 121 Theme F)', () => {
  afterEach(() => {
    cleanup();
    useToastStore.setState({ toasts: [] });
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('adds a bell entry with Resume, Stop and Raise, and each answers the trip', () => {
    const { emit, resolve } = installBridge();
    renderHook(() => useAgentLimitToasts());
    emit(trip);

    const [toast] = useToastStore.getState().toasts;
    expect(toast?.status).toBe('warning');
    expect([toast?.action?.label, ...(toast?.extraActions ?? []).map((a) => a.label)]).toEqual([
      'Resume',
      'Stop',
      'Raise limit for this session',
    ]);

    toast?.extraActions?.[1]?.onAction();
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ tripId: 'trip-1', action: 'raise' });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does nothing without a bridge', () => {
    renderHook(() => useAgentLimitToasts());
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
