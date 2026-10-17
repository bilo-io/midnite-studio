import {
  apiClientMain,
  createScriptRunnerBroker,
  scriptRunnerWorkerPath,
  shutdownApiClient,
  type ApiClientDialogs,
  type ScriptWorkerHandle,
} from '@midnite/studio-feature-api-client/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { dialog, utilityProcess, type BrowserWindow } from 'electron';

import { resolveWorkdir } from '../repo-registry';
import { handle, handleBare, handleSend } from './handle';

/**
 * Studio's composition of the API client feature's main half (Phase 113 Theme O): collections,
 * environments, history, the send engine, the collection runner and the script runner live in
 * `@midnite/studio-feature-api-client/main`; this hands it the repo registry's workdir, the native
 * file dialogs, the main window an event streams to, and the one thing only Electron can do — fork
 * the `utilityProcess` the sandboxed script worker runs in.
 */
export function registerApiClientFeatureHandlers(getWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    trashItem: () => Promise.reject(new Error('the API client never trashes')),
  };

  // `showOpenDialog(win, …)` when there is a window to attach to, the free-floating one otherwise.
  const dialogs: ApiClientDialogs = {
    pickFile: async ({ title, filters }) => {
      const win = getWindow();
      const options = { title, properties: ['openFile' as const], ...(filters ? { filters } : {}) };
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
    pickSavePath: async ({ title, defaultPath }) => {
      const win = getWindow();
      const options = { title, ...(defaultPath ? { defaultPath } : {}) };
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
  };

  apiClientMain.register(ctx, {
    workdir: (repoId) => resolveWorkdir(repoId),
    dialogs,
    scriptRunner: createScriptRunnerBroker({
      // Its own OS process — no Electron APIs, no main-process privileges (see the feature's broker).
      spawn: () =>
        utilityProcess.fork(scriptRunnerWorkerPath(), [], {
          serviceName: 'mstudio-script-runner',
          stdio: 'ignore',
        }) as unknown as ScriptWorkerHandle,
    }),
  });
}

/** Quit: abort running collection runs and kill the script worker. */
export const shutdownApiClientFeature = shutdownApiClient;
