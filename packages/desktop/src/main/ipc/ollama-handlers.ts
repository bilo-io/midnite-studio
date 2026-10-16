import { modelsMain } from '@midnite/studio-feature-models/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import type { BrowserWindow } from 'electron';

import { handle, handleBare, handleSend } from './handle';
import { readOllamaApiKey } from './secrets-handlers';

/**
 * Ollama (Phase 96 Theme B/C) is the models feature's main half (Phase 113
 * Theme N); this is Studio's composition of it. The client, the pull queue and
 * the persisted host override moved into `packages/features/models/main`; the
 * settings file stays under `userData` (`index.ts` configures it), and the
 * cloud key is read here from the vault and handed over as a function — it is
 * never an answer to any channel.
 */
export function registerOllamaHandlers(getMainWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    trashItem: () => Promise.reject(new Error('models never trashes')),
  };
  modelsMain.register(ctx, { cloudApiKey: readOllamaApiKey });
}
