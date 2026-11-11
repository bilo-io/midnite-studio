import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { ScienceBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Science exposes: the notebook channel and Report an Issue. Every other
 * bridge namespace is deliberately absent (`bridge.test.ts` holds the list).
 */
export type ScienceAppBridge = {
  /** Notebooks — one channel, one method per `op` (Phase 126 Theme B). */
  science: ScienceBridge;
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createScienceBridge(ipc: RendererIpc): ScienceAppBridge {
  const slice = createBridgeSlice(ipc);
  const { call } = slice;
  return {
    science: {
      list: () => call(CHANNELS.science, { op: 'list' }),
      read: (req) => call(CHANNELS.science, { op: 'read', ...req }),
      create: (req) => call(CHANNELS.science, { op: 'create', ...req }),
      write: (req) => call(CHANNELS.science, { op: 'write', ...req }),
      rename: (req) => call(CHANNELS.science, { op: 'rename', ...req }),
      remove: (req) => call(CHANNELS.science, { op: 'remove', ...req }),
      importStructure: () => call(CHANNELS.science, { op: 'importStructure' }),
    },
    report: createReportBridge(slice),
  };
}
