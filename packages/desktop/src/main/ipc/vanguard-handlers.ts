import { join } from 'node:path';

import {
  appBundlePath,
  createAutoPause,
  createSensorRunProcess,
  createVanguardService,
  INTERRUPT,
  resolveByFingerprint,
  vanguardMain,
  type AutoPause,
  type VanguardService,
} from '@midnite/studio-feature-vanguard/main';
import {
  createFindingsLedger,
  sendToLiveWindow,
  type FeatureMainContext,
  type FindingsLedger,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import { app, BrowserWindow, shell } from 'electron';

import { agentAuditTrail } from '../agent-audit';
import { defaultLogger } from '../log';
import { listRepos } from '../repo-registry';
import { broadcastToAllWindows } from '../window-manager';
import { studioBrokerScriptPath } from '../broker-client';
import { killPty, livePtyFor, observePtyOutput, onSessionExit, sessionIdFor, writePty } from '../pty-service';
import { liveAgentSessions, listTerminals } from '../terminal-service';
import { probeBinary } from '../system-health';
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
const ptySeams = {
  observe: observePtyOutput,
  sessionIdFor,
  listTerminals,
  onSessionExit: (hook: (sessionId: string) => void) =>
    onSessionExit((sessionId) => hook(sessionId)),
};

/**
 * Ctrl+C to the session's pty: the one pause write. Theme H's `pause-session`, Phase 121 F's breaker and
 * Theme G's auto-pause all go through this same write.
 */
export async function interruptSession(sessionId: string): Promise<boolean> {
  const live = livePtyFor(sessionId);
  if (!live) return false;
  writePty(live.ptyId, INTERRUPT);
  return true;
}

let autoPause: AutoPause | null = null;

/** The auto-pause modal's answer (resume or kill), from any window. */
export async function resolveAgentPause(request: { id: string; action: 'resume' | 'kill' }): Promise<boolean> {
  return (await autoPause?.resolve(request.id, request.action)) ?? false;
}

export async function startVanguardSensors(userData: string): Promise<void> {
  const ledger = getFindingsLedger();
  autoPause = createAutoPause({
    severities: () => serviceInstance?.settings.get().autoPauseSeverities ?? ['critical'],
    interrupt: interruptSession,
    kill: async (sessionId) => {
      const live = livePtyFor(sessionId);
      if (!live) return false;
      killPty(live.ptyId);
      return true;
    },
    announce: (prompt) => broadcastToAllWindows(EVENT_CHANNELS.vanguardAgentPaused, prompt),
    onError: (error) => defaultLogger.warn(`vanguard auto-pause: ${String(error)}`),
  });
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
                  ...(session.kind === 'agent' && session.agentId
                    ? { agentId: session.agentId }
                    : {}),
                  repoId: session.repoId,
                  cwd: session.cwd,
                  title: session.name ?? session.title,
                },
              ],
        ),
      resolve: resolveByFingerprint(ledger),
      // Theme G: the audit trail, read-only, and the ledger reads the correlation rule needs.
      rogue: {
        reader: {
          readSince: async (cursor) => (await agentAuditTrail()?.readSince(cursor)) ?? { records: [], cursor: null },
        },
        openFingerprints: async () =>
          new Set((await ledger.list({ status: 'open', category: 'agent' })).map((f) => f.fingerprint)),
        recentChanges: async (since) =>
          (await ledger.list({ category: ['persistence', 'network'], since })).filter((f) => f.firstSeen >= since),
        autoPause,
      },
      execPath: process.execPath,
      packaged: app.isPackaged,
      // Theme D, read-only: agent-pty output for the paste sensor, agent shell pids for the process sensor.
      // Theme F: yara and clamscan are found with the monitor feature's probe (desktop re-exports it).
      malware: { probe: probeBinary },
      persistenceProcess: {
        clickfix: { source: agentPtyOutputSource(ptySeams) },
        processes: { agentSessions: agentSessionPids(ptySeams) },
      },
      // Theme E: the app's own pid and its broker's script (the registry check), the agent ptys' root pids
      // (the per-repo baseline and the 10 s cadence) and window focus (the blur gate).
      network: {
        suite: { pid: process.pid, brokerMarkers: [studioBrokerScriptPath()] },
        agentSessions: liveAgentSessions,
        windowFocused: () =>
          BrowserWindow.getAllWindows().some(
            (win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused(),
          ),
      },
    },
    // Theme H: pausing reaches a live agent pty through the pty service; the app bundle, the broker's script
    // and its socket directory are never a target (the broker also runs `process.execPath`, which the kill
    // planner refuses on its own).
    response: {
      protectedPaths: [appBundlePath(process.execPath)],
      protectedMarkers: () => [studioBrokerScriptPath(), join(userData, 'broker')],
      sessions: liveAgentSessions,
      interrupt: interruptSession,
    },
    log: (level, message) =>
      defaultLogger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](message),
  });
  resolveService(serviceInstance);
  await serviceInstance.host.start();
}

/**
 * Phase 120 Theme F: a finished browser download (Phase 117's hook hands the path over; Vanguard never
 * touches `webContents`) joins the malware scanner's queue. Until the service exists, or while the sensor
 * is not running (Studio before the view is first opened), the path waits in the bounded queue.
 */
export function scanDownloadedFile(path: string): void {
  void serviceReady.then((service) => service.scanner.enqueue([path]));
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
    resolveAgentPause,
  });
}
