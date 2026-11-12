import { createAccountantServices, accountantModuleMain } from '@midnite/studio-module-accountant/main';
import { startupModuleMain, type InvoicePdfPort, type StartupElectron } from '@midnite/studio-module-startup/main';
import { createIpcContext, mountModuleMains } from '@midnite/studio-runtime';

import { createStartupLedgerPort } from './ledger-port';

/** What Startup's host needs from Electron: the module's own port, the runtime data base the books live beside, and the native dialogs. */
export type StartupHostElectron = StartupElectron & {
  appDataBase: string;
  pickCsv: () => Promise<string | null>;
  saveCsv: (defaultName: string) => Promise<string | null>;
  /** The invoice PDF's hidden printer and save dialog. */
  pdf?: InvoicePdfPort;
};

/**
 * Mounts the Startup host's two modules, Startup and Accountant (Phase 130 Theme F). Accountant mounts through
 * `mountModuleMains` over the shared books (`Midnite Runtime/books`, the ones Money opens); Startup gets the
 * books as a `StartupLedgerPort` built over that same service, so an invoice posts into the book the Books
 * group shows. Startup holds no secret, so there is no vault connection and no pairing. Report an Issue stays the
 * app's own (`report.ts`). `dispose` releases the book locks.
 */
export function registerStartupHost(el: StartupHostElectron): { dispose: () => Promise<void> } {
  const accountant = createAccountantServices({
    appDataBase: el.appDataBase,
    appId: 'startup',
    pickCsv: el.pickCsv,
    saveCsv: el.saveCsv,
    send: el.send,
    ...(el.warn ? { warn: el.warn } : {}),
  });
  mountModuleMains(createIpcContext(el), [
    { module: startupModuleMain, services: { electron: el, ledger: createStartupLedgerPort(accountant.service), ...(el.pdf ? { pdf: el.pdf } : {}) } },
    { module: accountantModuleMain, services: accountant },
  ]);
  return { dispose: () => accountant.service.dispose() };
}
