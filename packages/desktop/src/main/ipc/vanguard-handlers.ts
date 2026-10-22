import {
  createSensorRunProcess,
  createVanguardService,
  vanguardMain,
  type VanguardService,
} from '@midnite/studio-feature-vanguard/main';
import {
  createFindingsLedger,
  sendToLiveWindow,
  type FeatureMainContext,
  type FindingsLedger,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { app, shell, type BrowserWindow } from 'electron';

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

let serviceInstance: VanguardService | null = null;

/**
 * Studio's sensor host (Phase 120 Theme B). `'after-view-opened'`: a sensor Studio's user never asked for
 * must not start polling, so nothing runs until the Vanguard view has been opened once (persisted).
 */
export async function startVanguardSensors(userData: string): Promise<void> {
  const ledger = getFindingsLedger();
  serviceInstance = await createVanguardService({
    userData,
    homeDir: app.getPath('home'),
    runProcess: createSensorRunProcess({ defaultCwd: userData }),
    record: (finding) => ledger.record(finding),
    autostart: 'after-view-opened',
    onChanged: () => {
      const win = getWindowThunk();
      if (win && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.vanguardChanged);
    },
    log: (level, message) => defaultLogger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](message),
  });
  await serviceInstance.host.start();
}

export async function stopVanguardSensors(): Promise<void> {
  await serviceInstance?.host.stop();
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
    service: () => {
      if (!serviceInstance) throw new Error('Vanguard sensors have not been started yet');
      return serviceInstance;
    },
    openPath: async (path) => {
      const failure = await shell.openPath(path);
      if (failure) throw new Error(failure);
    },
    warn: (issue) => defaultLogger.warn(issue),
  });
}
