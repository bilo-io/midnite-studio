import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge, StartupRequest } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Startup exposes: the `startup` namespace (one method per op over the one
 * channel, plus `onChanged`) and Report an Issue. Every other bridge namespace is deliberately absent, so a
 * Startup renderer cannot reach git, the pty or the browser even by accident (`bridge.test.ts` holds the list).
 */
export type StartupBridge = {
  startup: NonNullable<MidniteStudioBridge['startup']>;
  /** Report an Issue — the report feature's own bridge half. */
  report: ReportBridge;
};

export type { RendererIpc };

export function createStartupBridge(ipc: RendererIpc): StartupBridge {
  const slice = createBridgeSlice(ipc);
  const { call, subscribe } = slice;
  const op =
    <O extends StartupRequest['op']>(name: O) =>
    (req?: Omit<Extract<StartupRequest, { op: O }>, 'op'>) =>
      call(CHANNELS.startup, { op: name, ...req });
  return {
    startup: {
      get: op('get'),
      updateCompany: op('updateCompany'),
      upsertMilestone: op('upsertMilestone'),
      removeMilestone: op('removeMilestone'),
      upsertLine: op('upsertLine'),
      removeLine: op('removeLine'),
      upsertScenario: op('upsertScenario'),
      removeScenario: op('removeScenario'),
      projection: op('projection'),
      upsertVendor: op('upsertVendor'),
      removeVendor: op('removeVendor'),
      upsertContract: op('upsertContract'),
      removeContract: op('removeContract'),
      attachContractFile: op('attachContractFile'),
      openContractFile: op('openContractFile'),
      upsertCustomer: op('upsertCustomer'),
      removeCustomer: op('removeCustomer'),
      upsertInvoice: op('upsertInvoice'),
      issueInvoice: op('issueInvoice'),
      markPaid: op('markPaid'),
      voidInvoice: op('voidInvoice'),
      exportInvoicePdf: op('exportInvoicePdf'),
      linkBook: op('linkBook'),
      ledgerSummary: op('ledgerSummary'),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.startupChanged, handler),
    } as unknown as StartupBridge['startup'],
    report: createReportBridge(slice),
  };
}
