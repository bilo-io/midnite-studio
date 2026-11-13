import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { HealthBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Health exposes: the `health` channel and Report an Issue. Every other
 * bridge namespace is deliberately absent (`bridge.test.ts` holds the list).
 */
export type HealthAppBridge = {
  /** Profile, logs, foods and plans — one channel, one method per `op` (Phase 128 Theme B). */
  health: HealthBridge;
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createHealthBridge(ipc: RendererIpc): HealthAppBridge {
  const slice = createBridgeSlice(ipc);
  const { call } = slice;
  return {
    health: {
      getProfile: () => call(CHANNELS.health, { op: 'getProfile' }),
      putProfile: (req) => call(CHANNELS.health, { op: 'putProfile', ...req }),
      getMonths: (req) => call(CHANNELS.health, { op: 'getMonths', ...req }),
      putDay: (req) => call(CHANNELS.health, { op: 'putDay', ...req }),
      getFoods: () => call(CHANNELS.health, { op: 'getFoods' }),
      upsertFood: (req) => call(CHANNELS.health, { op: 'upsertFood', ...req }),
      removeFood: (req) => call(CHANNELS.health, { op: 'removeFood', ...req }),
      listPlans: () => call(CHANNELS.health, { op: 'listPlans' }),
      writePlan: (req) => call(CHANNELS.health, { op: 'writePlan', ...req }),
      removePlan: (req) => call(CHANNELS.health, { op: 'removePlan', ...req }),
      exportAll: () => call(CHANNELS.health, { op: 'exportAll' }),
      eraseAll: () => call(CHANNELS.health, { op: 'eraseAll' }),
    },
    report: createReportBridge(slice),
  };
}
