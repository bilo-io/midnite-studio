import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';

/**
 * The slice of `window.midniteStudio` Health exposes. Theme A ships `report` only; Theme B adds `health`
 * (the health channel). Every other bridge namespace is deliberately absent (`bridge.test.ts` holds the list).
 */
export type HealthAppBridge = {
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createHealthBridge(ipc: RendererIpc): HealthAppBridge {
  const slice = createBridgeSlice(ipc);
  return {
    report: createReportBridge(slice),
  };
}
