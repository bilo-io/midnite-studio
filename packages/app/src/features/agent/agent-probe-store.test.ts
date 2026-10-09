// vitest/jsdom: pure store transitions; no browser capability needed.
import type { AgentStatus } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureAgentProbeSubscription,
  recheckAgents,
  resetAgentProbeStore,
  useAgentProbeStore,
} from './agent-probe-store';

const claude: AgentStatus = { id: 'claude', installed: true, resolvedPath: '/bin/claude' };

type StatusHandler = (e: { status: AgentStatus[]; probe: 'checking' | 'ready' | 'unknown' }) => void;

function stubBridge(recheck = vi.fn(async () => ({ status: [claude], probe: 'ready' as const }))) {
  let handler: StatusHandler = () => undefined;
  const onStatus = vi.fn((h: StatusHandler) => {
    handler = h;
    return () => undefined;
  });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { agent: { onStatus, recheck } };
  return { onStatus, recheck, push: (e: Parameters<StatusHandler>[0]) => handler(e) };
}

describe('agent probe store', () => {
  beforeEach(() => resetAgentProbeStore());
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('starts in "checking" with no status — never "installed" by default', () => {
    expect(useAgentProbeStore.getState()).toMatchObject({ status: [], probe: 'checking' });
  });

  it('a pushed event lands in the store', () => {
    const { push } = stubBridge();
    ensureAgentProbeSubscription();
    push({ status: [claude], probe: 'ready' });
    expect(useAgentProbeStore.getState()).toMatchObject({ status: [claude], probe: 'ready' });
  });

  it('subscribes once however many consumers mount', () => {
    const { onStatus } = stubBridge();
    ensureAgentProbeSubscription();
    ensureAgentProbeSubscription();
    expect(onStatus).toHaveBeenCalledOnce();
  });

  it('does nothing without a bridge and retries once one exists', () => {
    ensureAgentProbeSubscription();
    const { onStatus } = stubBridge();
    ensureAgentProbeSubscription();
    expect(onStatus).toHaveBeenCalledOnce();
  });

  it('an unknown push is surfaced and marks nothing missing', () => {
    const { push } = stubBridge();
    ensureAgentProbeSubscription();
    push({ status: [], probe: 'unknown' });
    expect(useAgentProbeStore.getState()).toMatchObject({ status: [], probe: 'unknown' });
  });

  it('an agent.list snapshot seeds the store, but never overrides a push', () => {
    useAgentProbeStore.getState().seed({ status: [claude], probe: 'ready' });
    expect(useAgentProbeStore.getState().probe).toBe('ready');

    resetAgentProbeStore();
    useAgentProbeStore.getState().applyPush({ status: [claude], probe: 'ready' });
    useAgentProbeStore.getState().seed({ status: [], probe: 'checking' });
    expect(useAgentProbeStore.getState()).toMatchObject({ status: [claude], probe: 'ready' });
  });

  it('a snapshot without a probe field (older main) reads as ready', () => {
    useAgentProbeStore.getState().seed({ status: [claude] });
    expect(useAgentProbeStore.getState().probe).toBe('ready');
  });

  it('recheck goes "checking" with nothing held, then applies the answer', async () => {
    const { recheck } = stubBridge();
    useAgentProbeStore.setState({ probe: 'unknown' });
    const pending = recheckAgents();
    expect(useAgentProbeStore.getState().probe).toBe('checking');
    await pending;
    expect(recheck).toHaveBeenCalledOnce();
    expect(useAgentProbeStore.getState()).toMatchObject({ status: [claude], probe: 'ready' });
  });

  it('recheck keeps showing held results instead of flickering to checking', async () => {
    stubBridge();
    useAgentProbeStore.setState({ status: [claude], probe: 'ready' });
    const pending = recheckAgents();
    expect(useAgentProbeStore.getState().probe).toBe('ready');
    await pending;
  });
});
