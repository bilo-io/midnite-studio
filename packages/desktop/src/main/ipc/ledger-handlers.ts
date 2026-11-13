import { join } from 'node:path';

import { createLedgerService, ledgerMain } from '@midnite/studio-feature-ledger/main';
import { runtimeDataDirectory, type FeatureMainContext } from '@midnite/studio-runtime';

import { app, BrowserWindow, dialog } from 'electron';

import { handle, handleBare, handleSend } from './handle';

/**
 * The books IPC (Phase 129) is the ledger feature's main half; this is Studio's composition of it, as
 * `appId: 'studio'`. Returns what releases the books' writer locks on quit. The books live under the
 * runtime's data directory, shared with every suite app that mounts the Accountant module.
 */
export function registerLedgerHandlers(): () => Promise<void> {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('the ledger never trashes')),
  };
  const service = createLedgerService({
    root: join(runtimeDataDirectory(app.getPath('appData')), 'books'),
    appId: 'studio',
    send: (channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
    },
    warn: (message) => console.warn(message),
  });
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
