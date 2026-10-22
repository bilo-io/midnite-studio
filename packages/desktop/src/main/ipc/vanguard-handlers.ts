import { vanguardMain } from '@midnite/studio-feature-vanguard/main';
import {
  createFindingsLedger,
  sendToLiveWindow,
  type FeatureMainContext,
  type FindingsLedger,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import { handle, handleBare, handleSend } from './handle';

let ledgerInstance: FindingsLedger | null = null;
let getWindowThunk: () => BrowserWindow | null = () => null;

export function configureFindingsLedger(
  userData: string,
  getWindow: () => BrowserWindow | null,
): FindingsLedger {
  getWindowThunk = getWindow;
  ledgerInstance = createFindingsLedger({
    userData,
    onChanged: () => {
      const win = getWindowThunk();
      if (win && !win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNELS.securityFindingsChanged);
      }
    },
  });
  return ledgerInstance;
}

export function getFindingsLedger(): FindingsLedger {
  if (!ledgerInstance) {
    throw new Error('Findings ledger has not been configured with userData yet');
  }
  return ledgerInstance;
}

export function registerVanguardHandlers(getWindow: () => BrowserWindow | null): void {
  getWindowThunk = getWindow;
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => sendToLiveWindow(getWindow, channel, payload),
    trashItem: () => Promise.reject(new Error('vanguard does not use trashItem directly')),
  };

  vanguardMain.register(ctx, {
    ledger: () => getFindingsLedger(),
    warn: (issue) => defaultLogger.warn(issue),
  });
}
