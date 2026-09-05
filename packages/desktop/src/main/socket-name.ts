import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

/**
 * Socket naming, shared by every Unix-socket server this process runs.
 *
 * Extracted from `broker-client.ts` (Phase 57 Decision 6) rather than
 * duplicated for the MCP server: it is not only `brokerSocketName` and
 * `fingerprintFile` that would drift silently if copied, but the 104-byte
 * `sun_path` guard below — and that copy's drift is fatal rather than
 * cosmetic (a socket bind that silently never happens on a long `userData`
 * path). `broker-client.ts` re-exports from here, so its own behaviour is
 * unchanged.
 */

/**
 * The socket a build looks for its broker (or MCP server) on.
 *
 * Keyed by version AND build fingerprint, not version alone. A long-lived
 * detached process outlives the bundle it was started from — the broker is
 * spawned detached on purpose, and the MCP server is not detached but a
 * `desktop:dist` reinstall can still replace the bundle underneath a listener
 * that has not yet noticed. A fingerprint in the name means a new build binds
 * its own socket rather than silently talking to code that no longer matches
 * what is on disk.
 */
export function brokerSocketName(appVersion: string, buildId: string, isPackaged: boolean): string {
  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;
}

/** The MCP server's own socket name — same fingerprint scheme, separate namespace from the broker's. */
export function mcpSocketName(appVersion: string, buildId: string, isPackaged: boolean): string {
  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;
}

/** Eight hex chars of the file's size and mtime; `unknown` when it cannot be read. */
export function fingerprintFile(path: string): string {
  try {
    const st = statSync(path);
    return createHash('sha1').update(`${st.size}:${Math.floor(st.mtimeMs)}`).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
}

/**
 * The historical `AF_UNIX` `sun_path` limit on macOS and Linux. A path at or
 * beyond this many bytes fails to bind with an opaque `ENAMETOOLONG`, so every
 * caller checks first rather than discovering it from a failed `listen()`.
 */
export const SUN_PATH_MAX_BYTES = 104;

export function isSocketPathTooLong(path: string): boolean {
  return Buffer.byteLength(path) >= SUN_PATH_MAX_BYTES;
}
