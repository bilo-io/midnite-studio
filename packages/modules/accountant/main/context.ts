import { join } from 'node:path';

import { createLedgerService, type LedgerMainServices } from '@midnite/studio-feature-ledger/main';
import { runtimeDataDirectory } from '@midnite/studio-runtime';
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
 * Builds the services the module mounts with: the books service over `<appData>/Midnite Runtime/books`, shared by
 * every app that mounts the module so they all see the same books (one writer each, by lock file).
 */
export function createAccountantServices(el: AccountantElectron): LedgerMainServices {
  const service = createLedgerService({ root: join(runtimeDataDirectory(el.appDataBase), 'books'), appId: el.appId, send: el.send, warn: el.warn });
  return { service, appId: el.appId, pickCsv: el.pickCsv, saveCsv: el.saveCsv };
}
