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

/** The MCP server's own socket name — lives in the runtime since Phase 153 Theme B, so a suite app names its socket the same way. */
export { mcpSocketName } from '@midnite/studio-runtime/mcp/socket-name';
