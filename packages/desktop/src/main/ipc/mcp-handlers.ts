import { CHANNELS, schemas } from '@midnite/studio-shared';

import { getMcpCallLog } from '../mcp/audit';
import { getMcpStatus, setMcpEnabled } from '../mcp';
import { handle, handleBare } from './handle';

/**
 * The MCP server's own Settings surface (Phase 57 Theme F): the enable
 * flag, live status, and the last-50 audit ring. Everything that actually
 * runs the tool socket lives in `main/mcp/` — this file only forwards to it,
 * mirroring `video-handlers.ts`'s own shape for `videoRootGet`/`videoRootSet`.
 */
export function registerMcpHandlers(): void {
  handleBare(CHANNELS.mcpGet, () => getMcpStatus());

  handle(
    CHANNELS.mcpSet,
    schemas.McpSetRequest,
    async ({ enabled }) => {
      const result = await setMcpEnabled(enabled);
      return result.ok ? result.status : { ...getMcpStatus(), error: result.message };
    },
    () => ({ ...getMcpStatus(), error: 'invalid request' }),
  );

  handleBare(CHANNELS.mcpCalls, () => ({ calls: getMcpCallLog() }));
}
