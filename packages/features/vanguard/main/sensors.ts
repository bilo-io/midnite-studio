import type { SensorDefinition } from './sensor-host';

/**
 * The sensors Vanguard ships. Themes C (integrity), D (persistence and process), E (network), F (malware)
 * and G (agent behaviour) each append their definition here; Theme B ships none, so the Sensors tab starts
 * with nothing registered and the host's lifecycle is exercised with fakes.
 */
export const BUILTIN_SENSORS: readonly SensorDefinition[] = [];
