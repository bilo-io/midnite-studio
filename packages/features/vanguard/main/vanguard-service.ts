import type { NewSecurityFinding, SecurityFinding } from '@midnite/studio-shared';

import { BUILTIN_SENSORS } from './sensors';
import {
  createSensorHost,
  type SensorDefinition,
  type SensorHost,
  type SensorLogLevel,
  type SensorRunProcess,
} from './sensor-host';
import { createVanguardSettingsState, createVanguardStore, type VanguardSettingsState, type VanguardStore } from './vanguard-store';

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
  /** Sensors to register; defaults to {@link BUILTIN_SENSORS}. */
  sensors?: readonly SensorDefinition[];
}

export interface VanguardService {
  host: SensorHost;
  settings: VanguardSettingsState;
  /** `<userData>/vanguard/quarantine` — where Theme H puts quarantined files. */
  quarantineDir: string;
}

/**
 * Loads the settings, builds the sensor host over them and registers the shipped sensors. The composer
 * calls `host.start()` once the window machinery is ready and `host.stop()` on quit.
 */
export async function createVanguardService(options: VanguardServiceOptions): Promise<VanguardService> {
  const settings = await createVanguardSettingsState(options.store ?? createVanguardStore(options.userData));
  const host = createSensorHost({
    userData: options.userData,
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    runProcess: options.runProcess,
    record: options.record,
    settings: settings.get,
    autostart: options.autostart,
    onChanged: options.onChanged,
    ...(options.log ? { log: options.log } : {}),
  });
  for (const def of options.sensors ?? BUILTIN_SENSORS) host.register(def);
  return { host, settings, quarantineDir: `${options.userData}/vanguard/quarantine` };
}
