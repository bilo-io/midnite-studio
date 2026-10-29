// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createMonitorBridge, type RendererIpc } from './bridge';

function fakeIpc() {
  const listeners = new Map<string, Set<(e: unknown, p: unknown) => void>>();
  const ipc: RendererIpc = {
    invoke: vi.fn(async () => 'answer'),
    send: vi.fn(),
    on: (c, l) => void (listeners.get(c) ?? listeners.set(c, new Set()).get(c))!.add(l),
    removeListener: (c, l) => void listeners.get(c)?.delete(l),
  };
  return { ipc, listeners };
}

describe('createMonitorBridge', () => {
  it('exposes exactly metrics, system health, the hand-off and the report feature calls', () => {
    const bridge = createMonitorBridge(fakeIpc().ipc);
    expect(Object.keys(bridge).sort()).toEqual(['handoff', 'metrics', 'monitorAgentUsage', 'report', 'systemHealth', 'systemHealthStartSshAgent', 'terminal']);
    expect(Object.keys(bridge.handoff)).toEqual(['open']);
    expect(Object.keys(bridge.terminal)).toEqual(['list']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
    expect(Object.keys(bridge.metrics).sort()).toEqual(['onSample', 'start', 'stop']);
  });

  it('invokes the system-health and report channels', async () => {
    const { ipc } = fakeIpc();
    const bridge = createMonitorBridge(ipc);
    await bridge.systemHealth();
    await bridge.report.bundle();
    await bridge.handoff.open({ link: 'midnite://open?app=studio' });
    const channels = vi.mocked(ipc.invoke).mock.calls.map((call) => call[0]);
    expect(channels).toEqual([CHANNELS.systemHealth, CHANNELS.reportBundle, CHANNELS.handoffOpen]);
  });

  it('sends metrics start one-way and returns a teardown that removes the sample listener', () => {
    const { ipc, listeners } = fakeIpc();
    const bridge = createMonitorBridge(ipc);
    bridge.metrics.start({ intervalMs: 2000 });
    expect(ipc.send).toHaveBeenCalledWith(CHANNELS.metricsStart, { intervalMs: 2000 });
    const off = bridge.metrics.onSample(() => undefined);
    expect(listeners.get(EVENT_CHANNELS.metricsSample)?.size).toBe(1);
    off();
    expect(listeners.get(EVENT_CHANNELS.metricsSample)?.size).toBe(0);
  });
});
