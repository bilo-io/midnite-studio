import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Cleaner exposes — exactly what the optimizer renderer and
 * the frame's metrics stream read, and nothing else: `optimizer.*`, `metrics.*` and
 * `repos.pickDirectory`. Every other bridge namespace is deliberately absent, so a Cleaner
 * renderer cannot reach git, the pty or the browser even by accident (`bridge-surface.test.ts`
 * holds the list).
 */
export type CleanerBridge = {
  /** Report an Issue: the dialog's channels and the Help-menu event (`createReportBridge`). */
  report: ReportBridge;
  optimizer: MidniteStudioBridge['optimizer'];
  metrics: MidniteStudioBridge['metrics'];
  repos: Pick<MidniteStudioBridge['repos'], 'pickDirectory'>;
};

export type { RendererIpc };

export function createCleanerBridge(ipc: RendererIpc): CleanerBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    // Report an Issue — the report feature's own preload half (`@midnite/studio-feature-report/bridge`).
    report: createReportBridge({ call, send, subscribe }),
    optimizer: {
      scan: (req) => call(CHANNELS.optimizerScan, req),
      onScanProgress: (handler) => subscribe(EVENT_CHANNELS.optimizerScanProgress, handler),
      clean: (req) => call(CHANNELS.optimizerClean, req),
      processes: () => call(CHANNELS.optimizerProcesses),
      kill: (req) => call(CHANNELS.optimizerKill, req),
      gpu: () => call(CHANNELS.optimizerGpu),
      trashSummary: () => call(CHANNELS.optimizerTrashSummary),
      emptyTrash: () => call(CHANNELS.optimizerTrashEmpty),
      systemCatalogue: () => call(CHANNELS.optimizerSystemCatalogue),
      systemScan: (req) => call(CHANNELS.optimizerSystemScan, req),
      onSystemScanProgress: (handler) =>
        subscribe(EVENT_CHANNELS.optimizerSystemScanProgress, handler),
      systemClean: (req) => call(CHANNELS.optimizerSystemClean, req),
      systemReclaim: (req) => call(CHANNELS.optimizerSystemReclaim, req),
    },
    metrics: {
      start: (req) => send(CHANNELS.metricsStart, req),
      stop: () => send(CHANNELS.metricsStop),
      onSample: (handler) => subscribe(EVENT_CHANNELS.metricsSample, handler),
    },
    repos: { pickDirectory: () => call(CHANNELS.repoPickDirectory) },
  };
}
