import { join } from 'node:path';

import {
  runtimeDataDirectory,
  startVaultHost,
  vaultHostSocketPath,
  writeRuntimeHostRecord,
  type PairingStore,
  type VaultGrants,
  type VaultHost,
  type VaultService,
} from '@midnite/studio-runtime';

/**
 * Studio as the runtime host (`docs/APPS.md`, "The shared data plane"): the process whose keychain
 * item holds every value a user has stored serves its one vault to the other apps, and records where
 * its pty broker listens so they can attach.
 *
 * Nothing moves: the vault files stay in Studio's `userData`, readable by Studio's key; the broker
 * keeps its build-fingerprinted socket there. What is new is a socket and a record under the
 * runtime's data directory, where the apps already look.
 */

/** The name `app.setName` gives Studio — its `userData` folder under `appData`. */
export const STUDIO_APP_NAME = 'Midnite Studio';

/**
 * Where Studio hosts. A real profile (`userData` = `<appData>/Midnite Studio`) hosts in the runtime's
 * data directory, where every app looks. A throwaway profile (`--user-data-dir` from e2e or a perf
 * run) hosts inside itself, so a test run never takes over the user's real runtime directory —
 * the same rule the apps' `MIDNITE_<APP>_USER_DATA` override follows (`<override>/runtime`).
 */
export function studioRuntimeDirectory(appData: string, userData: string): string {
  return userData === join(appData, STUDIO_APP_NAME) ? runtimeDataDirectory(appData) : join(userData, 'runtime');
}

export type StudioRuntimeHostOptions = {
  runtimeDirectory: string;
  service: VaultService;
  grants: VaultGrants;
  /** Which key each guest app paired with (`createPairingStore` over `<runtime>/host`). */
  pairings: PairingStore;
  /** The broker Studio's pty service reached, or null when it runs terminals in-process. */
  broker: { socketPath: string; directory: string } | null;
  /** Studio's `terminals.json`, so a read-only guest (Monitor) can title the broker's sessions. */
  sessionsFile: string | null;
  pid: number;
  log: (message: string) => void;
  now?: () => number;
};

/**
 * Serve the vault, then — only once this process is the host — write the record. Never throws: a
 * Studio that cannot host (another one already does, say a dev checkout beside the installed app, or
 * the path is too long) leaves the record to the host that has it and works exactly as before.
 */
export async function startStudioRuntimeHost(options: StudioRuntimeHostOptions): Promise<VaultHost | null> {
  const { runtimeDirectory, log } = options;
  let host: VaultHost;
  try {
    host = await startVaultHost({
      socketPath: vaultHostSocketPath(runtimeDirectory),
      service: options.service,
      grants: options.grants,
      pairings: options.pairings,
      log,
    });
  } catch (error) {
    log(`[runtime-host] not hosting: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const recorded = writeRuntimeHostRecord(runtimeDirectory, {
    version: 1,
    host: 'studio',
    pid: options.pid,
    writtenAt: (options.now ?? Date.now)(),
    broker: options.broker,
    sessionsFile: options.sessionsFile,
  });
  if (!recorded) log(`[runtime-host] could not write the host record under ${runtimeDirectory}`);
  return host;
}
