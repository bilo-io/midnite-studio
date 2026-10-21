/**
 * Socket naming for every Unix-socket server this process runs. The broker's
 * half — `brokerSocketName`, `fingerprintFile` and the `sun_path` guard —
 * moved into the runtime with the broker client (Phase 113 Theme D) and is
 * re-exported here unchanged; the MCP server's name stays until the runtime
 * owns the MCP server too (Theme D item 3).
 */
export {
  brokerSocketName,
  fingerprintFile,
  isSocketPathTooLong,
  SUN_PATH_MAX_BYTES,
} from '@midnite/studio-runtime/broker/socket-name';

/** The MCP server's own socket name — same fingerprint scheme, separate namespace from the broker's. */
export function mcpSocketName(appVersion: string, buildId: string, isPackaged: boolean): string {
  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;
}
