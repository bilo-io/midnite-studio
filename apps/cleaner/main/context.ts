import { optimizerMain } from '@midnite/studio-feature-optimizer/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { CLEANER_OPTIMIZER_SERVICES, NOT_PORTED } from './services';

/** The electron pieces Cleaner's main needs, injected so registration is testable under bare vitest. */
export type CleanerElectron = IpcContextElectron & {
  /** The native directory picker. */
  pickDirectory(): Promise<string | null>;
};

/**
 * Registers every channel Cleaner's renderer can call: the optimizer feature's, plus the three
 * the feature leaves to its composer (the Trash pair, and the directory picker).
 */
export function registerCleanerHandlers(el: CleanerElectron): void {
  optimizerMain.register(createIpcContext(el), CLEANER_OPTIMIZER_SERVICES);
  el.ipcMain.handle(CHANNELS.optimizerTrashSummary, () => ({ ok: false, message: NOT_PORTED }));
  el.ipcMain.handle(CHANNELS.optimizerTrashEmpty, () => ({ ok: false, message: NOT_PORTED }));
  el.ipcMain.handle(CHANNELS.repoPickDirectory, () => el.pickDirectory());
}
