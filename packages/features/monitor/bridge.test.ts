import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

import { createMonitorFeatureBridge } from './bridge';

function slice() {
  return { call: vi.fn(async () => ({}) as never), send: vi.fn(), subscribe: vi.fn(() => () => {}) };
}

describe('createMonitorFeatureBridge', () => {
  it('exposes exactly the namespaces the monitor segment reads', () => {
    expect(Object.keys(createMonitorFeatureBridge(slice())).sort()).toEqual(
      ['handoff', 'metrics', 'monitorAgentUsage', 'systemHealth', 'systemHealthStartSshAgent'].sort(),
    );
  });

  it('starts and stops the sampler with one-way sends and subscribes to its samples', () => {
    const s = slice();
    const bridge = createMonitorFeatureBridge(s);
    bridge.metrics.start({ intervalMs: 2000 });
    bridge.metrics.stop();
    const handler = vi.fn();
    bridge.metrics.onSample(handler);
    expect(s.send).toHaveBeenCalledWith(CHANNELS.metricsStart, { intervalMs: 2000 });
    expect(s.send).toHaveBeenCalledWith(CHANNELS.metricsStop);
    expect(s.subscribe).toHaveBeenCalledWith(EVENT_CHANNELS.metricsSample, handler);
  });

  it('asks main for health, usage and the hand-off over invokes', async () => {
    const s = slice();
    const bridge = createMonitorFeatureBridge(s);
    await bridge.systemHealth();
    await bridge.monitorAgentUsage();
    await bridge.handoff.open({ link: 'midnite://open?app=monitor' });
    expect(s.call).toHaveBeenCalledWith(CHANNELS.systemHealth);
    expect(s.call).toHaveBeenCalledWith(CHANNELS.monitorAgentUsage);
    expect(s.call).toHaveBeenCalledWith(CHANNELS.handoffOpen, { link: 'midnite://open?app=monitor' });
  });
});
