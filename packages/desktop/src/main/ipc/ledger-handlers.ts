import { createUnavailableLedgerService, ledgerMain } from '@midnite/studio-feature-ledger/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { app, dialog } from 'electron';

import { handle, handleBare, handleSend } from './handle';

/**
 * The books IPC (Phase 129) is the ledger feature's main half; this is Studio's composition of it, as
 * `appId: 'studio'`. Returns what releases the books' writer locks on quit. Until the book store lands
 * (Theme C) the service answers every op `io`.
 */
export function registerLedgerHandlers(): () => Promise<void> {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('the ledger never trashes')),
  };
  const service = createUnavailableLedgerService();
  ledgerMain.register(ctx, {
    service,
    appId: 'studio',
    pickCsv: async () => {
      const result = await dialog.showOpenDialog({ title: 'Choose a bank statement', filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }], properties: ['openFile'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    saveCsv: async (defaultName) => {
      const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      return result.canceled ? null : (result.filePath ?? null);
    },
  });
  return () => service.dispose();
}

/** Quit hook: kept beside the registration so the two cannot drift. */
export function releaseLedgerOnQuit(dispose: () => Promise<void>): void {
  app.on('will-quit', () => void dispose());
}
