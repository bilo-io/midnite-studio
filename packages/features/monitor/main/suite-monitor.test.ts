// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '@midnite/studio-shared';

import { monitorManifest } from '../manifest';
import { registerSuiteMonitor } from './index';

function fakeIpc() {
  const handled = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const sent = new Map<string, (event: unknown, raw: unknown) => void>();
  return {
    handled,
    sent,
    ipcMain: {
      handle: (channel: string, fn: (event: unknown, raw: unknown) => unknown) => void handled.set(channel, fn),
      on: (channel: string, fn: (event: unknown, raw: unknown) => void) => void sent.set(channel, fn),
    },
  };
}

describe('registerSuiteMonitor', () => {
  it('registers the monitor feature channels and the hand-off opener, and nothing else', () => {
    const ipc = fakeIpc();
    registerSuiteMonitor({
      ipcMain: ipc.ipcMain,
      trashItem: async () => {},
      send: () => {},
      warn: () => {},
      openExternal: async () => {},
      onMetricsService: () => {},
    });
    expect([...ipc.handled.keys(), ...ipc.sent.keys()].sort()).toEqual(
      [...monitorManifest.ipc, CHANNELS.handoffOpen].sort(),
    );
  });

  it('hands the app the sampler so its window can pause it', () => {
    const onMetricsService = vi.fn();
    registerSuiteMonitor({
      ipcMain: fakeIpc().ipcMain,
      trashItem: async () => {},
      send: () => {},
      warn: () => {},
      openExternal: async () => {},
      onMetricsService,
    });
    expect(onMetricsService).toHaveBeenCalledTimes(1);
    expect(onMetricsService.mock.calls[0]?.[0]).toMatchObject({ pause: expect.any(Function), resume: expect.any(Function) });
  });

  it('opens only a midnite link, answers token spend empty without sessions, and reports a bad start', async () => {
    const ipc = fakeIpc();
    const openExternal = vi.fn(async () => {});
    const warn = vi.fn();
    registerSuiteMonitor({ ipcMain: ipc.ipcMain, trashItem: async () => {}, send: () => {}, warn, openExternal, onMetricsService: () => {} });

    const refused = await ipc.handled.get(CHANNELS.handoffOpen)!({}, { link: 'https://example.com' });
    expect(refused).toEqual({ ok: false });
    expect(openExternal).not.toHaveBeenCalled();

    const usage = (await ipc.handled.get(CHANNELS.monitorAgentUsage)!({}, undefined)) as { sessions: unknown[] };
    expect(usage.sessions).toEqual([]);

    ipc.sent.get(CHANNELS.metricsStart)!({}, { intervalMs: 'nope' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
