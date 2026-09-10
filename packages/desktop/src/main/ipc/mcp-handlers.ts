import { CHANNELS, schemas } from '@midnite/studio-shared';

import { getMcpCallLog } from '../mcp/audit';
import { getMcpStatus, setMcpAllowUi, setMcpEnabled } from '../mcp';
import { handle, handleBare } from './handle';

/**
 * The MCP server's own Settings surface (Phase 57 Theme F, plus Phase 81
 * Theme F's second switch): the enable flag, the `allowUi` UI-steering
 * flag, live status, and the last-50 audit ring. Everything that actually
 * runs the tool socket (or the `ui.*` gate) lives in `main/mcp/` — this file
 * only forwards to it, mirroring `video-handlers.ts`'s own shape for
 * `videoRootGet`/`videoRootSet`.
 */
export function registerMcpHandlers(): void {
  handleBare(CHANNELS.mcpGet, () => getMcpStatus());

  /*
    `enabled` and `allowUi` are independent controls sharing one channel —
    a request touches only the field its own switch means to change, and
    whichever is absent keeps its current persisted value (each setter reads
    the other from module state before writing). Applying `enabled` first
    means a request that (unusually) sent both lands with the master switch's
    own side effects (starting/stopping the socket) settled before the
    narrower one is persisted.
  */
  handle(
    CHANNELS.mcpSet,
    schemas.McpSetRequest,
    async ({ enabled, allowUi }) => {
      if (enabled !== undefined) {
        const result = await setMcpEnabled(enabled);
        if (!result.ok) return { ...getMcpStatus(), error: result.message };
      }
      if (allowUi !== undefined) {
        const result = await setMcpAllowUi(allowUi);
        if (!result.ok) return { ...getMcpStatus(), error: result.message };
      }
      return getMcpStatus();
    },
    () => ({ ...getMcpStatus(), error: 'invalid request' }),
  );

  handleBare(CHANNELS.mcpCalls, () => ({ calls: getMcpCallLog() }));
}
