import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';

/**
 * The slice of `window.midniteStudio` Startup exposes. Theme A carries only Report an Issue; Theme B adds the
 * `startup` namespace, one method per op. Every other bridge namespace is deliberately absent, so a Startup
 * renderer cannot reach git, the pty or the browser even by accident (`bridge.test.ts` holds the list).
 */
export type StartupBridge = {
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createStartupBridge(ipc: RendererIpc): StartupBridge {
  const slice = createBridgeSlice(ipc);
  return {
    report: createReportBridge(slice),
  };
}
