import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` the Accountant module exposes: `ledger.*` — one method per op of the
 * channel's request union — and nothing else.
 */
export type AccountantBridge = { ledger: NonNullable<MidniteStudioBridge['ledger']> };

export type { RendererIpc };

export function createAccountantBridge(ipc: RendererIpc): AccountantBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    ledger: {
      listBooks: () => call(CHANNELS.ledger, { op: 'listBooks' }),
      getBook: (req) => call(CHANNELS.ledger, { op: 'getBook', ...req }),
      createBook: (req) => call(CHANNELS.ledger, { op: 'createBook', ...req }),
      updateBook: (req) => call(CHANNELS.ledger, { op: 'updateBook', ...req }),
      upsertAccount: (req) => call(CHANNELS.ledger, { op: 'upsertAccount', ...req }),
      archiveAccount: (req) => call(CHANNELS.ledger, { op: 'archiveAccount', ...req }),
      post: (req) => call(CHANNELS.ledger, { op: 'post', ...req }),
      reverse: (req) => call(CHANNELS.ledger, { op: 'reverse', ...req }),
      journal: (req) => call(CHANNELS.ledger, { op: 'journal', ...req }),
      balances: (req) => call(CHANNELS.ledger, { op: 'balances', ...req }),
      report: (req) => call(CHANNELS.ledger, { op: 'report', ...req }),
      exportReport: (req) => call(CHANNELS.ledger, { op: 'exportReport', ...req }),
      importPick: (req) => call(CHANNELS.ledger, { op: 'importPick', ...req }),
      importPreview: (req) => call(CHANNELS.ledger, { op: 'importPreview', ...req }),
      importCommit: (req) => call(CHANNELS.ledger, { op: 'importCommit', ...req }),
      taxEstimate: (req) => call(CHANNELS.ledger, { op: 'taxEstimate', ...req }),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.ledgerChanged, handler),
    },
  };
}
