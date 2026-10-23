import { homedir } from 'node:os';

import type { NewSecurityFinding, SecurityFinding } from '@midnite/studio-shared';

import { createResponseActions, type ResponseActions, type ResponseSession } from './actions';
import { createConnectionStore, type ConnectionStore } from './network-sensor';
import { createMalwareScanner, MALWARE_SENSOR_ID, type MalwareScanner } from './malware/scanner';
import { createQuarantineStore, type QuarantineStore } from './response/quarantine';
import { builtinSensors, type VanguardSensorDeps } from './sensors';
import {
  createSensorHost,
  type SensorDefinition,
  type SensorHost,
  type SensorLogLevel,
  type SensorRunProcess,
} from './sensor-host';
import {
  createVanguardSettingsState,
  createVanguardStore,
  type VanguardSettingsState,
  type VanguardStore,
} from './vanguard-store';

export interface VanguardServiceOptions {
  userData: string;
  homeDir?: string;
  runProcess: SensorRunProcess;
  record: (finding: NewSecurityFinding) => Promise<SecurityFinding>;
  /** Studio: `'after-view-opened'`. Vanguard's own app: `'always'`. */
  autostart: 'always' | 'after-view-opened';
  onChanged: () => void;
  log?: (level: SensorLogLevel, message: string) => void;
  /** Overridable for tests; defaults to a file store under `userData`. */
  store?: VanguardStore;
  /** What the shipped sensors need from the composer (repos, live sessions, app identity). */
  sensorDeps?: VanguardSensorDeps;
  /** Sensors to register; defaults to {@link builtinSensors} over `sensorDeps`. */
  sensors?: readonly SensorDefinition[];
  /** What the response actions need from the composer (Theme H). Each field has a safe default. */
  response?: VanguardResponseOptions;
}

/**
 * The response actions' seams. The identity fields default to this process; the composer adds what only it
 * knows — its bundle, its terminal broker, how to reach a live session.
 */
export interface VanguardResponseOptions {
  uid?: number;
  selfPid?: number;
  selfExecPath?: string;
  /** Never a file target, beside `userData` (always protected): the app bundle. */
  protectedPaths?: readonly string[];
  /** Command-line markers of the suite's own processes (its broker's script and socket directory). */
  protectedMarkers?: () => readonly string[];
  sessions?: () => Promise<readonly ResponseSession[]>;
  interrupt?: (sessionId: string) => Promise<boolean>;
  /** The issue form's App value; Studio's by default. */
  issueApp?: string;
}

export interface VanguardService {
  host: SensorHost;
  settings: VanguardSettingsState;
  /** The network sensor's last snapshot, for the Network tab. */
  connections: ConnectionStore;
  /** `<userData>/vanguard/quarantine` — where Theme H puts quarantined files. */
  quarantineDir: string;
  /** Theme H: the quarantine and its manifests. */
  quarantine: QuarantineStore;
  /** Theme H: plan and run a finding's response actions. */
  response: ResponseActions;
  /** Theme F: on-demand scans, the queue downloads and flagged files are added to, and engine status. */
  scanner: MalwareScanner;
}

/**
 * Loads the settings, builds the sensor host over them and registers the shipped sensors. The composer
 * calls `host.start()` once the window machinery is ready and `host.stop()` on quit.
 */
export async function createVanguardService(
  options: VanguardServiceOptions,
): Promise<VanguardService> {
  const settings = await createVanguardSettingsState(
    options.store ?? createVanguardStore(options.userData),
  );
  // Declared first: the scanner asks the host to run the sensor when something is queued, the host's
  // record feeds flagged paths to the scanner. Both only reference the other once running.
  let hostRef: SensorHost | null = null;
  const repos = options.sensorDeps?.repos;
  const scanner = createMalwareScanner({
    userData: options.userData,
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    runProcess: options.runProcess,
    ...(options.sensorDeps?.malware?.probe ? { probe: options.sensorDeps.malware.probe } : {}),
    record: (finding) => options.record({ ...finding, source: 'vanguard' }),
    ...(repos ? { repos } : {}),
    onChanged: options.onChanged,
    onQueued: () => void hostRef?.runNow(MALWARE_SENSOR_ID),
  });
  const host = createSensorHost({
    userData: options.userData,
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    runProcess: options.runProcess,
    record: async (finding) => {
      const recorded = await options.record(finding);
      // A file another sensor flagged (integrity, persistence, process) is scanned too.
      scanner.noteFinding(finding);
      return recorded;
    },
    settings: settings.get,
    autostart: options.autostart,
    onChanged: options.onChanged,
    ...(options.log ? { log: options.log } : {}),
  });
  const connections = createConnectionStore();
  hostRef = host;
  for (const def of options.sensors ?? builtinSensors({ ...options.sensorDeps, connections }, scanner)) host.register(def);
  const quarantineDir = `${options.userData}/vanguard/quarantine`;
  const retentionDays = (): number => settings.get().quarantineRetentionDays;
  const quarantine = createQuarantineStore({ quarantineDir, runProcess: options.runProcess, now: Date.now, retentionDays });
  const r = options.response ?? {};
  const response = createResponseActions({
    homeDir: options.homeDir ?? homedir(),
    uid: r.uid ?? process.getuid?.() ?? -1,
    selfPid: r.selfPid ?? process.pid,
    selfExecPath: r.selfExecPath ?? process.execPath,
    protectedPaths: [options.userData, ...(r.protectedPaths ?? [])],
    ...(r.protectedMarkers ? { protectedMarkers: r.protectedMarkers } : {}),
    runProcess: options.runProcess,
    quarantine,
    rescan: (path) => scanner.check([path]),
    ...(r.sessions ? { sessions: r.sessions } : {}),
    ...(r.interrupt ? { interrupt: r.interrupt } : {}),
    ...(r.issueApp ? { issueApp: r.issueApp } : {}),
    retentionDays,
  });
  // Files past their retention go at start; the response-state read purges again, so a long-running app does too.
  void quarantine.purge().catch((error: unknown) => options.log?.('warn', `quarantine purge: ${String(error)}`));
  return { host, settings, connections, quarantineDir, quarantine, response, scanner };
}
