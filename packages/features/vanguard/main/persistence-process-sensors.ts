import { createAppleSignalsSensor, type AppleSignalsDeps } from './apple-signals';
import { createClickFixSensor, type ClickFixDeps } from './clickfix';
import { createPersistenceSensor, type PersistenceSensorOptions } from './persistence-sensor';
import { createProcessSensor, type ProcessSensorDeps } from './process-sensor';
import type { SensorDefinition } from './sensor-host';

/** Everything Theme D's sensors take from the composer; each part is optional. */
export interface PersistenceProcessDeps {
  persistence?: PersistenceSensorOptions;
  processes?: ProcessSensorDeps;
  apple?: AppleSignalsDeps;
  /** The broker's output stream and the agent-session shells arrive here once the composer wires them. */
  clickfix?: ClickFixDeps;
}

/** Theme D's four sensors. With no deps they run with their defaults (the paste sensor idles). */
export function createPersistenceProcessSensors(
  deps: PersistenceProcessDeps = {},
): SensorDefinition[] {
  return [
    createPersistenceSensor(deps.persistence),
    createProcessSensor(deps.processes),
    createAppleSignalsSensor(deps.apple),
    createClickFixSensor(deps.clickfix),
  ];
}
