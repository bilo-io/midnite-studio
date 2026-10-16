import { join } from 'node:path';

import { createMarketsRuntime, financeMain, startRatesRefresh } from '@midnite/studio-feature-finance/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { app } from 'electron';

import { defaultLogger } from '../log';
import { handle, handleBare, handleSend } from './handle';
import { readTwelveDataKey } from './secrets-handlers';

/**
 * The Finance IPC — provider proxy and markets — is the finance feature's main
 * half (Phase 113 Theme P); this is Studio's composition of it. The cache and
 * the simulated portfolio stay under `userData/finance`, exactly where they
 * were, and the Twelve Data key is read here from the vault and handed to the
 * feature as a function: it is never an answer to any channel.
 */
export function registerFinanceHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('finance never trashes')),
  };
  const runtime = createMarketsRuntime(join(app.getPath('userData'), 'finance'));
  financeMain.register(ctx, {
    runtime,
    twelveDataKey: readTwelveDataKey,
    warn: (issue) => defaultLogger.warn(issue),
  });
  // Keep the FX table fresh in the background; a failed refresh is only logged.
  startRatesRefresh(runtime, (message) => defaultLogger.warn(message));
}
