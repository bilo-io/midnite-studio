import { createUnavailableLedgerService, type LedgerMainServices } from '@midnite/studio-feature-ledger/main';
import type { SuiteAppId } from '@midnite/studio-shared';

/**
 * The host pieces the Accountant module's main needs, injected so registration is testable under bare vitest
 * (the layer rule: no `electron` import). The pickers are the host's native dialogs.
 */
export type AccountantElectron = {
  /** The host's `appData` directory — books live under the runtime's data directory beside it (Theme C). */
  appDataBase: string;
  appId: SuiteAppId;
  pickCsv: () => Promise<string | null>;
  saveCsv: (defaultName: string) => Promise<string | null>;
  send: (channel: string, payload: unknown) => void;
  warn?: (message: string) => void;
};

/**
 * Builds the services the module mounts with. Until the book store lands (Phase 129 Theme C) the service is
 * the unavailable one, so the channel answers `io` rather than a missing handler.
 */
export function createAccountantServices(el: AccountantElectron): LedgerMainServices {
  return { service: createUnavailableLedgerService(), appId: el.appId, pickCsv: el.pickCsv, saveCsv: el.saveCsv };
}
