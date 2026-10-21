// vitest/jsdom: the hook is the single read path for install status.
import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetAgentProbeStore, useAgentProbeStore } from '../agent/agent-probe-store';
import { useAgents } from './use-agents';

describe('useAgents reads the shared probe store', () => {
  beforeEach(() => resetAgentProbeStore());
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('with no bridge nothing was asked: unknown, never "checking" forever', () => {
    const { result } = renderHook(() => useAgents());
    expect(result.current.agents).toEqual(BUILTIN_AGENTS);
    expect(result.current.status).toEqual([]);
    expect(result.current.probe).toBe('unknown');
  });

  it('with a bridge and no answer yet it reports checking', () => {
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      agent: { list: () => new Promise(() => undefined), onStatus: () => () => undefined },
    };
    const { result } = renderHook(() => useAgents());
    expect(result.current.probe).toBe('checking');
    expect(result.current.status).toEqual([]);
  });

  it('a store update reaches every hook instance', () => {
    const a = renderHook(() => useAgents());
    const b = renderHook(() => useAgents());
    act(() => {
      useAgentProbeStore.getState().applyPush({
        status: [{ id: 'claude', installed: false, resolvedPath: null }],
        probe: 'ready',
      });
    });
    expect(a.result.current.status[0]?.installed).toBe(false);
    expect(b.result.current.status).toEqual(a.result.current.status);
  });
});
