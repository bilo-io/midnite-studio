import { reportMain, type ReportMainServices } from '@midnite/studio-feature-report/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';

import { cleanerModuleMain } from './module';

/** The electron pieces Cleaner's main needs, injected so registration is testable under bare vitest. */
export type CleanerElectron = IpcContextElectron & {
  /** Report an Issue's services — the crash log sink, home dir, and the three OS calls the dialog needs. */
  report: ReportMainServices;
  /** The native directory picker. */
  pickDirectory(): Promise<string | null>;
};

/**
 * Registers every channel Cleaner's renderer can call: Report an Issue (the host's), then the
 * Cleaner module's — the optimizer feature's, plus the Trash pair and the directory picker.
 */
export function registerCleanerHandlers(el: CleanerElectron): void {
  const ctx = createIpcContext(el);
  reportMain.register(ctx, el.report);
  cleanerModuleMain.register(ctx, { pickDirectory: el.pickDirectory });
}
