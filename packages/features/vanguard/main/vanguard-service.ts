import type { NewSecurityFinding, SecurityFinding } from '@midnite/studio-shared';

import { createMalwareScanner, MALWARE_SENSOR_ID, type MalwareScanner } from './malware/scanner';
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
}

export interface VanguardService {
  host: SensorHost;
  settings: VanguardSettingsState;
  /** `<userData>/vanguard/quarantine` — where Theme H puts quarantined files. */
  quarantineDir: string;
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
  hostRef = host;
  for (const def of options.sensors ?? builtinSensors(options.sensorDeps ?? {}, scanner)) host.register(def);
  return { host, settings, quarantineDir: `${options.userData}/vanguard/quarantine`, scanner };
}
