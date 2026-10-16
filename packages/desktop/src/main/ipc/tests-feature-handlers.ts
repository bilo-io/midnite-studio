import { testsMain } from '@midnite/studio-feature-tests/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import type { BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import { resolveWorkdir } from '../repo-registry';
import { handle, handleBare, handleSend } from './handle';

/**
 * Studio's composition of the tests feature's main half (Phase 113 Theme O):
 * discovery, trust and the runner live in `@midnite/studio-feature-tests/main`;
 * this hands it the repo registry's workdir and the main window, which is where
 * a run's output and result have always streamed.
 */
export function registerTestsFeatureHandlers(getWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    trashItem: () => Promise.reject(new Error('tests never trashes')),
  };
  testsMain.register(ctx, {
    workdir: (repoId) => resolveWorkdir(repoId),
    warn: (message) => defaultLogger.warn(message),
  });
}
