import {
  createSensorRunProcess,
  createVanguardService,
  resolveByFingerprint,
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
import { listRepos } from '../repo-registry';
import { observePtyOutput, sessionIdFor } from '../pty-service';
import { listTerminals } from '../terminal-service';
import { agentPtyOutputSource, agentSessionPids } from './vanguard-sensor-wiring';
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
let resolveService: (service: VanguardService) => void = () => undefined;
/** Handlers register before the service is built (it reads a file first); requests wait on this. */
const serviceReady = new Promise<VanguardService>((resolve) => {
  resolveService = resolve;
});

/**
 * Studio's sensor host (Phase 120 Theme B). `'after-view-opened'`: a sensor Studio's user never asked for
 * must not start polling, so nothing runs until the Vanguard view has been opened once (persisted).
 */
const ptySeams = { observe: observePtyOutput, sessionIdFor, listTerminals };

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
    sensorDeps: {
      repos: async () => (await listRepos()).map((repo) => ({ repoId: repo.id, path: repo.path })),
      // Live ptys only. An agent pty carries the pty-env.ts fingerprint (agentId); a plain shell does not,
      // and the integrity sensor never attributes a change to one.
      liveSessions: async () =>
        (await listTerminals()).flatMap(({ session, live }) =>
          live === null
            ? []
            : [
                {
                  sessionId: session.id,
                  ...(session.kind === 'agent' && session.agentId ? { agentId: session.agentId } : {}),
                  repoId: session.repoId,
                  cwd: session.cwd,
                  title: session.name ?? session.title,
                },
              ],
        ),
      resolve: resolveByFingerprint(ledger),
      execPath: process.execPath,
      packaged: app.isPackaged,
      // Theme D, read-only: agent-pty output for the paste sensor, agent shell pids for the process sensor.
      persistenceProcess: {
        clickfix: { source: agentPtyOutputSource(ptySeams) },
        processes: { agentSessions: agentSessionPids(ptySeams) },
      },
    },
    log: (level, message) =>
      defaultLogger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](message),
  });
  resolveService(serviceInstance);
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
    service: () => serviceReady,
    openPath: async (path) => {
      const failure = await shell.openPath(path);
      if (failure) throw new Error(failure);
    },
    warn: (issue) => defaultLogger.warn(issue),
  });
}
