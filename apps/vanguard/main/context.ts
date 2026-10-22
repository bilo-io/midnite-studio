import {
  createSensorRunProcess,
  createVanguardService,
  vanguardMain,
  type VanguardService,
} from '@midnite/studio-feature-vanguard/main';
import { readHostSessions, sessionsGuestMain, shutdownGuestSessions } from '@midnite/studio-feature-sessions/main';
import {
  createFindingsLedger,
  createIpcContext,
  createSharedBroker,
  readRuntimeHostRecord,
  type IpcContextElectron,
  type LogSink,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

/** The electron pieces Vanguard's main needs, injected so registration is testable under bare vitest. */
export type VanguardElectron = IpcContextElectron & {
  /** Vanguard's own userData: the findings ledger, `vanguard.json` and the quarantine live under it. */
  userData: string;
  homeDir: string;
  /** Vanguard's crash log — the runtime's file sink, the same one Studio's main writes through. */
  log: LogSink;
  /** The runtime's data directory, where the runtime host (Studio) records its broker for guests. */
  runtimeDirectory: string;
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
  const ctx = createIpcContext(el);
  const ledger = createFindingsLedger({ userData: el.userData, onChanged: () => el.send(EVENT_CHANNELS.securityFindingsChanged, undefined) });
  const service = await createVanguardService({
    userData: el.userData,
    homeDir: el.homeDir,
    runProcess: createSensorRunProcess({ defaultCwd: el.userData }),
    record: (finding) => ledger.record(finding),
    autostart: 'always',
    onChanged: () => el.send(EVENT_CHANNELS.vanguardChanged, undefined),
    log: (level, message) => el.log.write(level, message),
  });
  vanguardMain.register(ctx, {
    ledger: () => ledger,
    service: () => service,
    openPath: async (path) => {
      const failure = await el.openPath(path);
      if (failure) throw new Error(failure);
    },
    warn: (issue) => el.log.write('warn', issue),
  });
  // The runtime host's sessions, attach-only: listed, attached, written to. Vanguard starts and kills none.
  sessionsGuestMain.register(ctx, {
    broker: createSharedBroker({ runtimeDirectory: el.runtimeDirectory, appId: 'vanguard' }),
    hostSessions: () => readHostSessions(readRuntimeHostRecord(el.runtimeDirectory)?.sessionsFile),
  });
  await service.host.start();
  return {
    service,
    shutdown: async () => {
      await service.host.stop();
      await shutdownGuestSessions();
    },
  };
}
