/**
 * The MCP server's own socket name — same fingerprint scheme as the broker's (`../broker/socket-name`),
 * separate namespace (`<userData>/mcp/`). Moved here from `desktop/src/main/socket-name.ts` in Phase 153
 * Theme B so a suite app's server (`app-server.ts`) names its socket exactly as Studio does; the desktop
 * file re-exports it.
 */
export function mcpSocketName(appVersion: string, buildId: string, isPackaged: boolean): string {
  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;
}
