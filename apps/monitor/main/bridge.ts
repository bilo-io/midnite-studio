import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Monitor exposes — exactly what the monitor renderer and the
 * frame's metrics stream read, and nothing else: `metrics.*`, `systemHealth*`, read-only `terminal.list`, the hand-off
 * and the report feature's `report.*` (crash-log reads and Report an Issue). Every other bridge namespace is deliberately
 * absent, so a Monitor renderer cannot reach git, the pty or the browser even by accident
 * (`bridge.test.ts` holds the list).
 */
export type MonitorBridge = {
  metrics: MidniteStudioBridge['metrics'];
  systemHealth: MidniteStudioBridge['systemHealth'];
  systemHealthStartSshAgent: NonNullable<MidniteStudioBridge['systemHealthStartSshAgent']>;
  monitorAgentUsage: NonNullable<MidniteStudioBridge['monitorAgentUsage']>;
  terminal: Pick<MidniteStudioBridge['terminal'], 'list'>;
  /** "Open in Studio" on a session: a `midnite://open` link main hands to the launcher's router. */
  handoff: NonNullable<MidniteStudioBridge['handoff']>;
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createMonitorBridge(ipc: RendererIpc): MonitorBridge {
  const slice = createBridgeSlice(ipc);
  const { call, send, subscribe } = slice;
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
    handoff: { open: (req) => call(CHANNELS.handoffOpen, req) },
    report: createReportBridge(slice),
  };
}
