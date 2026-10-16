import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Monitor exposes — exactly what the monitor renderer and the
 * frame's metrics stream read, and nothing else: `metrics.*`, `systemHealth*`, read-only `terminal.list` and the two read-side
 * crash-log calls (`report.logPath`, `report.bundle`). Every other bridge namespace is deliberately
 * absent, so a Monitor renderer cannot reach git, the pty or the browser even by accident
 * (`bridge.test.ts` holds the list).
 */
export type MonitorBridge = {
  metrics: MidniteStudioBridge['metrics'];
  systemHealth: MidniteStudioBridge['systemHealth'];
  systemHealthStartSshAgent: NonNullable<MidniteStudioBridge['systemHealthStartSshAgent']>;
  monitorAgentUsage: NonNullable<MidniteStudioBridge['monitorAgentUsage']>;
  terminal: Pick<MidniteStudioBridge['terminal'], 'list'>;
  report: Pick<MidniteStudioBridge['report'], 'logPath' | 'bundle'>;
};

export type { RendererIpc };

export function createMonitorBridge(ipc: RendererIpc): MonitorBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    metrics: {
      start: (req) => send(CHANNELS.metricsStart, req),
      stop: () => send(CHANNELS.metricsStop),
      onSample: (handler) => subscribe(EVENT_CHANNELS.metricsSample, handler),
    },
    systemHealth: () => call(CHANNELS.systemHealth),
    systemHealthStartSshAgent: () => call(CHANNELS.systemHealthStartSshAgent),
    monitorAgentUsage: () => call(CHANNELS.monitorAgentUsage),
    terminal: { list: () => call(CHANNELS.terminalList) },
    report: {
      logPath: () => call(CHANNELS.reportLogPath),
      bundle: () => call(CHANNELS.reportBundle),
    },
  };
}
