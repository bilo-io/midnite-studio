import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';

/**
 * The slice of `window.midniteStudio` Science exposes. Theme A ships `report` only; Theme B adds `science`
 * (the notebook channel). Every other bridge namespace is deliberately absent (`bridge.test.ts` holds the list).
 */
export type ScienceAppBridge = {
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createScienceBridge(ipc: RendererIpc): ScienceAppBridge {
  const slice = createBridgeSlice(ipc);
  return {
    report: createReportBridge(slice),
  };
}
