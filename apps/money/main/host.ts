import { createAccountantServices, accountantModuleMain } from '@midnite/studio-module-accountant/main';
import { registerMoneyHandlers, type MoneyElectron } from '@midnite/studio-module-money/main';
import type { LedgerService } from '@midnite/studio-feature-ledger/main';
import { createIpcContext, mountModuleMains } from '@midnite/studio-runtime';

/** What Money's host adds to the markets pieces: the runtime data base the books live beside, and the two native dialogs. */
export type MoneyHostElectron = MoneyElectron & {
  appDataBase: string;
  pickCsv: () => Promise<string | null>;
  saveCsv: (defaultName: string) => Promise<string | null>;
};

/**
 * Mounts the Money host's modules, Money and Accountant (Phase 129 Theme A). Money keeps its own registration
 * (`registerMoneyHandlers`, unchanged); Accountant mounts through `mountModuleMains`. Returns the books
 * service (Phase 130's host port reaches the same books through it), what quits the host (releases the
 * book locks) and what stops the background rate refresh.
 */
export function registerMoneyHost(el: MoneyHostElectron): { ledger: LedgerService; dispose: () => Promise<void>; stopRates: () => void } {
  const stopRates = registerMoneyHandlers(el);
  const accountant = createAccountantServices({
    appDataBase: el.appDataBase,
    appId: 'money',
    pickCsv: el.pickCsv,
    saveCsv: el.saveCsv,
    send: el.send,
    ...(el.warn ? { warn: el.warn } : {}),
  });
  mountModuleMains(createIpcContext(el), [{ module: accountantModuleMain, services: accountant }]);
  return { ledger: accountant.service, dispose: () => accountant.service.dispose(), stopRates };
}
