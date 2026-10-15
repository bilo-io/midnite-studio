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
  it('exposes exactly optimizer, metrics and repos.pickDirectory', () => {
    const bridge = createCleanerBridge(fakeIpc().ipc);
    expect(Object.keys(bridge).sort()).toEqual(['metrics', 'optimizer', 'repos']);
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
