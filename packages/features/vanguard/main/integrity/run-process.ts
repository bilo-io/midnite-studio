/**
 * The process seam the integrity sensor runs `git`, `codesign` and `spctl` through: the sensor host's
 * `SensorRunProcess` (one trusted command, an argument vector, no shell, never rejects), bound by the
 * composer to the runtime's `runProcess`.
 */
export type {
  SensorRunProcess as IntegrityRunProcess,
  SensorRunProcessResult as IntegrityRunProcessResult,
} from '../sensor-host';
