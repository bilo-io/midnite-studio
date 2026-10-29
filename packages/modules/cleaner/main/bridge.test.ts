// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createCleanerBridge, type RendererIpc } from './bridge';

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

describe('createCleanerBridge', () => {
  it('exposes exactly optimizer, metrics, report and repos.pickDirectory', () => {
    const bridge = createCleanerBridge(fakeIpc().ipc);
    expect(Object.keys(bridge).sort()).toEqual(['metrics', 'optimizer', 'report', 'repos']);
    expect(Object.keys(bridge.repos)).toEqual(['pickDirectory']);
    expect(Object.keys(bridge.optimizer).sort()).toEqual(
      ['clean', 'emptyTrash', 'gpu', 'kill', 'onScanProgress', 'onSystemScanProgress', 'processes', 'scan', 'systemCatalogue', 'systemClean', 'systemReclaim', 'systemScan', 'trashSummary'].sort(),
    );
  });

  it('invokes the optimizer channel with the request', async () => {
    const { ipc } = fakeIpc();
    await createCleanerBridge(ipc).optimizer.scan({});
    expect(ipc.invoke).toHaveBeenCalledWith(CHANNELS.optimizerScan, {});
  });

  it('every subscription returns a teardown that removes its listener', () => {
    const { ipc, listeners } = fakeIpc();
    const off = createCleanerBridge(ipc).optimizer.onScanProgress(() => undefined);
    expect(listeners.get(EVENT_CHANNELS.optimizerScanProgress)?.size).toBe(1);
    off();
    expect(listeners.get(EVENT_CHANNELS.optimizerScanProgress)?.size).toBe(0);
  });
});

describe('report namespace', () => {
  it("is the report feature's own bridge: its channels over invoke, the crash report over send, the Help-menu event over on", async () => {
    const ipc: RendererIpc = { invoke: vi.fn(async () => ({})), send: vi.fn(), on: vi.fn(() => undefined), removeListener: vi.fn() };
    const { report } = createCleanerBridge(ipc);
    await report.ghStatus();
    report.error({ source: 'window', name: 'E', message: 'm', stack: '' } as never);
    const off = report.onOpen?.(() => undefined);
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([CHANNELS.reportGhStatus]);
    expect(vi.mocked(ipc.send).mock.calls.map((c) => c[0])).toEqual([CHANNELS.reportError]);
    expect(vi.mocked(ipc.on).mock.calls.map((c) => c[0])).toEqual([EVENT_CHANNELS.reportOpen]);
    expect(typeof off).toBe('function');
  });
});
