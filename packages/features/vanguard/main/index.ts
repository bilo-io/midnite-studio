import { defineFeatureMain } from '@midnite/studio-runtime';

import { vanguardManifest } from '../manifest';
import { registerFindingsHandlers, type FindingsHandlersServices } from './findings-handlers';
import { registerSensorHandlers, type SensorHandlersServices } from './sensor-handlers';

export { vanguardManifest, type VanguardManifest } from '../manifest';
export { registerFindingsHandlers, type FindingsHandlersServices } from './findings-handlers';
export { registerSensorHandlers, type SensorHandlersServices } from './sensor-handlers';
export {
  createSensorHost,
  type SensorContext,
  type SensorDefinition,
  type SensorHost,
  type SensorHostOptions,
  type SensorLogLevel,
  type SensorRunProcess,
  type SensorRunProcessResult,
  type SensorRunResult,
  type SensorSchedule,
  type SensorTimers,
} from './sensor-host';
export {
  BUILTIN_SENSORS,
  builtinSensors,
  resolveByFingerprint,
  type ResolvableLedger,
  type VanguardSensorDeps,
} from './sensors';
export {
  BUNDLE_SENSOR_ID,
  createBundleIntegritySensor,
  createIntegritySensor,
  INTEGRITY_SENSOR_ID,
  type IntegrityLiveSession,
  type IntegrityRepo,
} from './integrity-sensor';
export {
  createPersistenceProcessSensors,
  type PersistenceProcessDeps,
} from './persistence-process-sensors';
export {
  createMalwareScanner,
  MALWARE_SENSOR_ID,
  type MalwareScanner,
  type MalwareScannerDeps,
} from './malware/scanner';
export type { BinaryProbe } from './malware/engines';
export type { PtyOutputChunk, PtyOutputSource } from './clickfix';
export { createSensorRunProcess } from './run-process';
export {
  createVanguardService,
  type VanguardService,
  type VanguardServiceOptions,
} from './vanguard-service';
export {
  createVanguardSettingsState,
  createVanguardStore,
  type VanguardSettingsState,
  type VanguardStore,
} from './vanguard-store';

export type VanguardMainServices = FindingsHandlersServices & SensorHandlersServices;

export const vanguardMain = defineFeatureMain<VanguardMainServices>({
  feature: 'vanguard',
  channels: vanguardManifest.ipc,
  register(ctx, services) {
    registerFindingsHandlers(ctx, services);
    registerSensorHandlers(ctx, services);
  },
});
