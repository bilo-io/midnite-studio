import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * The runtime host record (Phase 113, toward V5 — `docs/APPS.md`, "The shared data plane").
 *
 * One process is the **runtime host**: the one whose keychain identity holds the vault (Studio
 * today). It serves the vault on a socket at a fixed path under the runtime's data directory, and
 * writes this record so a guest app can find what has no fixed path — the pty broker, whose socket
 * is named by the host's own build (`brokerSocketName`) under the host's own data directory.
 *
 * Names and paths only, never a secret. Written atomically (temp + rename, `0600`, directory
 * `0700`); read without ever throwing — missing, unreadable or malformed all mean "no host
 * recorded", and a guest then reports the service as unavailable rather than guessing a path.
 */

export const RUNTIME_HOST_DIRECTORY_NAME = 'host';
export const RUNTIME_HOST_RECORD_FILE = 'host.json';
export const VAULT_HOST_SOCKET_FILE = 'vault.sock';

/** `<runtimeDir>/host` — the host's sockets and record. */
export function runtimeHostDirectory(runtimeDirectory: string): string {
  return join(runtimeDirectory, RUNTIME_HOST_DIRECTORY_NAME);
}

/** `<runtimeDir>/host/vault.sock` — fixed, so a guest needs no record to reach the vault. */
export function vaultHostSocketPath(runtimeDirectory: string): string {
  return join(runtimeHostDirectory(runtimeDirectory), VAULT_HOST_SOCKET_FILE);
}

export function runtimeHostRecordPath(runtimeDirectory: string): string {
  return join(runtimeHostDirectory(runtimeDirectory), RUNTIME_HOST_RECORD_FILE);
}

const RuntimeHostRecordSchema = z.object({
  version: z.literal(1),
  /** Which app hosts (`studio` today). Informational — a guest trusts the socket, not this. */
  host: z.string().min(1),
  pid: z.number().int().positive(),
  writtenAt: z.number().int().nonnegative(),
  /** The host's current broker socket and the directory its legacy peers sit in; null when it runs in-process. */
  broker: z.object({ socketPath: z.string().min(1), directory: z.string().min(1) }).nullable(),
  /**
   * The host's terminal list (`terminals.json`: titles, agents, start times — no output), which a
   * read-only guest like Monitor joins to the broker's live sessions. Absent: the guest shows only
   * what the broker knows.
   */
  sessionsFile: z.string().min(1).nullable().optional(),
});

export type RuntimeHostRecord = z.infer<typeof RuntimeHostRecordSchema>;

/** Write the record. Returns false (never throws) when the directory cannot be written. */
export function writeRuntimeHostRecord(runtimeDirectory: string, record: RuntimeHostRecord): boolean {
  const dir = runtimeHostDirectory(runtimeDirectory);
  const path = runtimeHostRecordPath(runtimeDirectory);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(RuntimeHostRecordSchema.parse(record), null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, path);
    return true;
  } catch {
    return false;
  }
}

/** The recorded host, or null when there is none or the file is not one we wrote. */
export function readRuntimeHostRecord(runtimeDirectory: string): RuntimeHostRecord | null {
  try {
    const parsed = RuntimeHostRecordSchema.safeParse(JSON.parse(readFileSync(runtimeHostRecordPath(runtimeDirectory), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
