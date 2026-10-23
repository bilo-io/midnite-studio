import type { SecurityFinding, SecurityFindingStatus } from '@midnite/studio-shared';

import {
  createBundleIntegritySensor,
  createIntegritySensor,
  type IntegrityLiveSession,
  type IntegrityRepo,
} from './integrity-sensor';
import {
  createPersistenceProcessSensors,
  type PersistenceProcessDeps,
} from './persistence-process-sensors';
import { createMalwareSensor } from './malware/malware-sensor';
import type { BinaryProbe } from './malware/engines';
import type { MalwareScanner } from './malware/scanner';
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
  /** Theme D: the agent-session shell pids and the read-only pty output stream. */
  persistenceProcess?: PersistenceProcessDeps;
  /**
   * Theme F: the monitor feature's `probeBinary`, which finds `yara` and `clamscan`. A feature cannot import
   * the monitor feature, so the composer injects it. Absent (`apps/vanguard`), engines are looked for at the Homebrew and
   * system paths only. With none found the built-in matcher runs the bundled ruleset alone: the calm "no engine installed" state.
   */
  malware?: { probe?: BinaryProbe };
}

export function builtinSensors(deps: VanguardSensorDeps, scanner?: MalwareScanner): SensorDefinition[] {
  const sensors: SensorDefinition[] = [
    ...BUILTIN_SENSORS,
    createIntegritySensor({
      repos: deps.repos ?? (() => []),
      liveSessions: deps.liveSessions ?? (() => []),
      ...(deps.resolve ? { resolve: deps.resolve } : {}),
    }),
  ];
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
  // Theme F: malware scanning on change. The scanner is the service's (it also answers on-demand scans).
  if (scanner) sensors.push(createMalwareSensor({ scanner, ...(deps.repos ? { repos: deps.repos } : {}) }));
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
