import {
  databaseMain,
  shutdownDb,
  type ConnectionsStore,
  type CredentialVault,
  type QueryStreams,
} from '@midnite/studio-feature-database/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import type { BrowserWindow } from 'electron';

import { cancel as cancelStream, cancelKind, register, release } from '../stream-registry';
import { handle, handleBare, handleSend } from './handle';

/**
 * Studio's composition of the Database feature's main half (Phase 113 Theme O): connections, the
 * pooled query service and the credential binding live in `@midnite/studio-feature-database/main`;
 * this hands it the connection store and the credential vault (both rooted at `userData`, the
 * vault being Studio's own over `db-credentials`), the main window rows stream to, and the window's
 * stream registry — the same one the commit log and the search register in, so a query is
 * superseded and torn down with the window exactly as before.
 */
export function registerDatabaseFeatureHandlers(
  getWindow: () => BrowserWindow | null,
  stores: { connections: ConnectionsStore; credentials: CredentialVault },
): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    trashItem: () => Promise.reject(new Error('the Database tool never trashes')),
  };

  const streams: QueryStreams = {
    register: (stream) => {
      const win = getWindow();
      if (win) register(win, { ...stream, kind: 'query' });
    },
    cancel: (requestId) => {
      const win = getWindow();
      if (win) cancelStream(win, requestId);
    },
    release: (requestId) => {
      const win = getWindow();
      if (win) release(win, requestId);
    },
    cancelAll: () => {
      const win = getWindow();
      if (win) cancelKind(win, 'query');
    },
  };

  databaseMain.register(ctx, { ...stores, streams });
}

/** Quit: disconnect every pooled connection. */
export const shutdownDatabaseFeature = shutdownDb;
