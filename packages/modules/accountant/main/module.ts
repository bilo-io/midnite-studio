import { ledgerMain, type LedgerMainServices } from '@midnite/studio-feature-ledger/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

/**
 * The Accountant module's main half, on the feature seam so a host can mount it through `mountModuleMains`.
 * The host builds the services (the book service, the native pickers) and hands them in.
 */
export const accountantModuleMain = defineFeatureMain<LedgerMainServices>({
  feature: 'ledger',
  channels: ledgerMain.channels,
  register: (ctx, services) => ledgerMain.register(ctx, services),
});
