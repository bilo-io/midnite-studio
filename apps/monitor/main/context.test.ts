// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { describe, expect, it, vi } from 'vitest';

import { monitorManifest } from '@midnite/studio-feature-monitor/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerMonitorHandlers } from './context';
import { createCrashLog } from './crash-log';

function setup() {
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const on = new Set<string>();
  const log = createCrashLog('/tmp/monitor.log', '/Users/someone', { now: () => 0, append: () => undefined });
  const onMetricsService = vi.fn();
  registerMonitorHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c) => void on.add(c) },
    trashItem: async () => undefined,
    send: () => undefined,
    onMetricsService,
    log,
  });
  return { handlers, on, log, onMetricsService };
}

describe('registerMonitorHandlers', () => {
  it('registers the feature channels plus the two crash-log reads, and nothing else', () => {
    const { handlers, on } = setup();
    expect([...handlers.keys(), ...on].sort()).toEqual(
      [...monitorManifest.ipc, CHANNELS.reportLogPath, CHANNELS.reportBundle].sort(),
    );
    // metrics start/stop are one-way sends
    expect(on).toEqual(new Set([CHANNELS.metricsStart, CHANNELS.metricsStop]));
  });

  it('hands main the sampler so it can pause on blur', () => {
    expect(setup().onMetricsService).toHaveBeenCalledTimes(1);
  });

  it('answers the crash-log reads from the log, with home redacted', () => {
    const { handlers, log } = setup();
    log.write('error', 'boom at /Users/someone/secret/file.ts');
    expect(handlers.get(CHANNELS.reportLogPath)?.({}, undefined)).toEqual({ path: '/tmp/monitor.log' });
    const { text } = handlers.get(CHANNELS.reportBundle)?.({}, undefined) as { text: string };
    expect(text).toContain('ERROR boom at');
    expect(text).not.toContain('/Users/someone');
  });
});
