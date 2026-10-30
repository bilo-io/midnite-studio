import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The monitor feature's preload half (Phase 123 Theme H): the namespaces the status bar's monitor
 * segment and its flyout read — `metrics.*`, `systemHealth*`, `monitorAgentUsage` — plus `handoff.open`,
 * which the flyout's "Open Monitor" button leaves through. An app's preload spreads this into its
 * `unionBridgeSlices(...)`; the matching main half is `registerSuiteMonitor` (`./main`).
 *
 * Channel names only, by source path, like every preload slice: the shared barrel would drag every zod
 * schema in. The slice is restated structurally for the same reason `report/bridge.ts` does.
 */
export type MonitorBridgeSlice = {
  call<Req, Res>(channel: string, req?: Req): Promise<Res>;
  send(channel: string, req?: unknown): void;
  subscribe<T>(channel: string, handler: (payload: T) => void): () => void;
};

export type MonitorFeatureBridge = {
  metrics: MidniteStudioBridge['metrics'];
  systemHealth: MidniteStudioBridge['systemHealth'];
  systemHealthStartSshAgent: NonNullable<MidniteStudioBridge['systemHealthStartSshAgent']>;
  monitorAgentUsage: NonNullable<MidniteStudioBridge['monitorAgentUsage']>;
  handoff: NonNullable<MidniteStudioBridge['handoff']>;
};

export function createMonitorFeatureBridge({ call, send, subscribe }: MonitorBridgeSlice): MonitorFeatureBridge {
  return {
    metrics: {
      start: (req) => send(CHANNELS.metricsStart, req),
      stop: () => send(CHANNELS.metricsStop),
      onSample: (handler) => subscribe(EVENT_CHANNELS.metricsSample, handler),
    },
    systemHealth: () => call(CHANNELS.systemHealth),
    systemHealthStartSshAgent: () => call(CHANNELS.systemHealthStartSshAgent),
    monitorAgentUsage: () => call(CHANNELS.monitorAgentUsage),
    handoff: { open: (req) => call(CHANNELS.handoffOpen, req) },
  };
}
