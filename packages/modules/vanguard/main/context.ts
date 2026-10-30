import { dirname } from 'node:path';

import {
  appBundlePath,
  createSensorRunProcess,
  createVanguardService,
  INTERRUPT,
  resolveByFingerprint,
  type VanguardService,
} from '@midnite/studio-feature-vanguard/main';
import {
  guestSessionRecord,
  readHostSessions,
  shutdownGuestSessions,
} from '@midnite/studio-feature-sessions/main';
import {
  createFindingsLedger,
  createIpcContext,
  createSharedBroker,
  mountModuleMains,
  readRuntimeHostRecord,
  type IpcContextElectron,
  type LogSink,
  type ModuleMount,
  type SharedBroker,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { vanguardModuleMain, type VanguardModuleServices } from './module';

/** The electron pieces Vanguard's main needs, injected so registration is testable under bare vitest. */
export type VanguardElectron = IpcContextElectron & {
  /** Vanguard's own userData: the findings ledger, `vanguard.json` and the quarantine live under it. */
  userData: string;
  homeDir: string;
  /** Vanguard's crash log — the runtime's file sink, the same one Studio's main writes through. */
  log: LogSink;
  /** The runtime's data directory, where the runtime host (Studio) records its broker for guests. */
  runtimeDirectory: string;
  /** Vanguard's window is visible, not minimized and focused; absent when no window exists to ask. */
  windowFocused?: () => boolean;
  /** `shell.openPath`: resolves to an error string, empty on success. */
  openPath: (path: string) => Promise<string>;
};

/**
 * Registers every channel Vanguard's renderer can call: the vanguard feature's (findings, sensors,
 * settings) and the sessions feature's guest channels (the runtime host's terminal sessions as a broker
 * guest, so a finding's "pause the session" has a broker to talk to). Report an Issue is the report
 * feature's (`report.ts`). Vanguard composes no vault and opens no network connection.
 *
 * Unlike Studio, Vanguard starts every enabled sensor at launch (`autostart: 'always'`): the user
 * installed this app to be watched over.
 */
export async function registerVanguardHandlers(el: VanguardElectron): Promise<{ service: VanguardService; shutdown: () => Promise<void> }> {
  const { mount, service, shutdown } = await prepareVanguard(el);
  mountModuleMains(createIpcContext(el), [mount]);
  await service.host.start();
  return { service, shutdown };
}

/**
 * Builds Vanguard's service and the module mount over it, registering nothing and starting nothing: a host
 * that mounts more modules than its own (Phase 124 Theme E.3) passes `mount` to `mountModuleMains` beside
 * theirs, then starts `service.host`. {@link registerVanguardHandlers} is the one-module path.
 */
export async function prepareVanguard(
  el: VanguardElectron,
): Promise<{ mount: ModuleMount; service: VanguardService; broker: SharedBroker; shutdown: () => Promise<void> }> {
  const broker = createSharedBroker({ runtimeDirectory: el.runtimeDirectory, appId: 'vanguard' });
  const ledger = createFindingsLedger({ userData: el.userData, onChanged: () => el.send(EVENT_CHANNELS.securityFindingsChanged, undefined) });
  // The host's agent sessions: the pty pids come from the shared broker, which agent they run from the host's
  // terminal records. No broker, no sessions.
  const agentSessions = async (): Promise<{ sessionId: string; repoId: string; pid: number; title: string }[]> => {
    const known = readHostSessions(readRuntimeHostRecord(el.runtimeDirectory)?.sessionsFile);
    const { sessions } = await broker.listSessions();
    return sessions.flatMap((live) => {
      const session = guestSessionRecord(live, known, 0);
      return session.kind === 'agent'
        ? [{ sessionId: session.id, repoId: session.repoId, pid: live.pid, title: session.name ?? session.title }]
        : [];
    });
  };
  const service = await createVanguardService({
    userData: el.userData,
    homeDir: el.homeDir,
    runProcess: createSensorRunProcess({ defaultCwd: el.userData }),
    record: (finding) => ledger.record(finding),
    autostart: 'always',
    onChanged: () => el.send(EVENT_CHANNELS.vanguardChanged, undefined),
    log: (level, message) => el.log.write(level, message),
    // Theme H. Every action but Phase 121's pair; pausing reaches the host's sessions through the shared
    // broker, so it works only while Studio's broker is up. Studio itself and its broker are never a target.
    response: {
      issueApp: 'midnite-vanguard',
      // Never a file target: this app's bundle, Studio's, the runtime's shared data (vault, host record) and
      // Studio's userData, which its host record locates through the terminal list it names.
      protectedPaths: () => {
        const host = readRuntimeHostRecord(el.runtimeDirectory);
        return [
          appBundlePath(process.execPath),
          '/Applications/Midnite Studio.app',
          el.runtimeDirectory,
          ...(host?.sessionsFile ? [dirname(host.sessionsFile)] : []),
        ];
      },
      protectedPids: () => {
        const host = readRuntimeHostRecord(el.runtimeDirectory);
        return host ? [host.pid] : [];
      },
      protectedMarkers: () => {
        const host = readRuntimeHostRecord(el.runtimeDirectory);
        return host?.broker ? [host.broker.socketPath, host.broker.directory] : [];
      },
      sessions: agentSessions,
      interrupt: async (sessionId) => {
        const client = await broker.client();
        if (client === null) return false;
        const live = (await client.listSessions()).find((s) => s.sessionId === sessionId);
        if (!live) return false;
        client.writePty(live.ptyId, INTERRUPT);
        return true;
      },
    },
    // No repo registry or pty sessions of its own: the integrity sensor watches the user-level agent
    // config only, and a finding resolves once its change is reverted.
    sensorDeps: {
      resolve: resolveByFingerprint(ledger),
      // The network sensor holds Vanguard's own process to an empty registry (it composes no vault and
      // opens no connection) and watches the host's agent sessions: the pty pids come from the shared
      // broker, which agent they run from the host's terminal records. No broker, no sessions: the sensor
      // then runs at the idle rate and only while this window is focused.
      network: {
        suite: { pid: process.pid },
        agentSessions,
        ...(el.windowFocused ? { windowFocused: el.windowFocused } : {}),
      },
    },
  });
  const vanguard: VanguardModuleServices['vanguard'] = {
    ledger: () => ledger,
    service: () => service,
    openPath: async (path) => {
      const failure = await el.openPath(path);
      if (failure) throw new Error(failure);
    },
    warn: (issue) => el.log.write('warn', issue),
  };
  // The runtime host's sessions, attach-only: listed, attached, written to. Vanguard starts and kills none.
  const sessions = {
    broker,
    hostSessions: () => readHostSessions(readRuntimeHostRecord(el.runtimeDirectory)?.sessionsFile),
  };
  return {
    mount: { module: vanguardModuleMain, services: { vanguard, sessions } },
    service,
    broker,
    shutdown: async () => {
      await service.host.stop();
      await shutdownGuestSessions();
    },
  };
}
