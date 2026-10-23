import type { SecurityFinding, SecurityFindingStatus } from '@midnite/studio-shared';

import {
  createBundleIntegritySensor,
  createIntegritySensor,
  type IntegrityLiveSession,
  type IntegrityRepo,
} from './integrity-sensor';
import { createConnectionStore, createNetworkSensor, type ConnectionStore, type NetworkSensorDeps } from './network-sensor';
import {
  createPersistenceProcessSensors,
  type PersistenceProcessDeps,
} from './persistence-process-sensors';
import type { SensorDefinition } from './sensor-host';

/**
 * The sensors Vanguard ships. Themes C (integrity), D (persistence and process), E (network), F (malware)
 * and G (agent behaviour) each add theirs: a sensor that needs nothing from the composer goes in
 * {@link BUILTIN_SENSORS}; one that needs the composer's repos, sessions or app identity is built in
 * {@link builtinSensors} from {@link VanguardSensorDeps}.
 */
export const BUILTIN_SENSORS: readonly SensorDefinition[] = [];

/**
 * What a sensor may need from the composer, beyond the host's `SensorContext`. Every field is optional:
 * an app that has no repos or no pty sessions (a guest) omits them, and the sensors that read them see
 * nothing rather than fail.
 */
export interface VanguardSensorDeps {
  /** The repos open now. */
  repos?(): readonly IntegrityRepo[] | Promise<readonly IntegrityRepo[]>;
  /** The pty sessions live now; an agent pty carries `agentId` (the `pty-env.ts` fingerprint). */
  liveSessions?(): readonly IntegrityLiveSession[] | Promise<readonly IntegrityLiveSession[]>;
  /** Resolve the open finding with this fingerprint (a sensor's condition cleared). */
  resolve?(fingerprint: string): Promise<void>;
  /** The running app's executable (`process.execPath`), for the bundle self-check. */
  execPath?: string;
  /** An installed build (`app.isPackaged`). */
  packaged?: boolean;
  /**
   * The network sensor's inputs (Phase 120 Theme E): who the suite's processes are, the agent sessions live
   * now, and whether the window is focused. Present: the sensor is registered. Absent: it is not.
   */
  network?: Omit<NetworkSensorDeps, 'connections'>;
  /** Where the network sensor leaves its snapshot; the service passes the one its handler reads. */
  connections?: ConnectionStore;
  /** Theme D: the agent-session shell pids and the read-only pty output stream. */
  persistenceProcess?: PersistenceProcessDeps;
}

export function builtinSensors(deps: VanguardSensorDeps): SensorDefinition[] {
  const sensors: SensorDefinition[] = [
    ...BUILTIN_SENSORS,
    createIntegritySensor({
      repos: deps.repos ?? (() => []),
      liveSessions: deps.liveSessions ?? (() => []),
      ...(deps.resolve ? { resolve: deps.resolve } : {}),
    }),
  ];
  if (deps.network !== undefined) {
    sensors.push(createNetworkSensor({ ...deps.network, connections: deps.connections ?? createConnectionStore() }));
  }
  if (deps.execPath !== undefined) {
    sensors.push(
      createBundleIntegritySensor({
        execPath: deps.execPath,
        packaged: deps.packaged ?? false,
        ...(deps.resolve ? { resolve: deps.resolve } : {}),
      }),
    );
  }
  // Theme D: persistence, processes, Apple signals, terminal paste shapes.
  sensors.push(...createPersistenceProcessSensors(deps.persistenceProcess));
  return sensors;
}

/** The slice of the findings ledger {@link resolveByFingerprint} needs. */
export interface ResolvableLedger {
  list(filter: { status: SecurityFindingStatus }): Promise<SecurityFinding[]>;
  setStatus(id: string, status: SecurityFindingStatus): Promise<SecurityFinding | null>;
}

/** `resolve` over the ledger: every open finding with the fingerprint becomes `resolved`. */
export function resolveByFingerprint(
  ledger: ResolvableLedger,
): (fingerprint: string) => Promise<void> {
  return async (fingerprint) => {
    for (const finding of await ledger.list({ status: 'open' })) {
      if (finding.fingerprint === fingerprint) await ledger.setStatus(finding.id, 'resolved');
    }
  };
}
