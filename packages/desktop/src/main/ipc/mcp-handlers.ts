import { mcpToolsMain, type McpToolsServer, type McpToolsSetRequest } from '@midnite/studio-feature-mcp-tools/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { getMcpCallLog } from '../mcp/audit';
import { getMcpStatus, setMcpAllowCompanionSettings, setMcpAllowGames, setMcpAllowGateDecide, setMcpAllowMaps, setMcpAllowModels, setMcpAllowMusic, setMcpAllowSprites, setMcpAllowTerrains, setMcpAllowUi, setMcpEnabled } from '../mcp';
import { handle, handleBare, handleSend } from './handle';

/**
 * The MCP server's own Settings surface (Phase 57 Theme F, plus Phase 81
 * Theme F's second switch) is the MCP tools feature's main half (Phase 113
 * Theme N); this is Studio's composition of it. Everything that actually runs
 * the tool socket (or the `ui.*` gate) lives in `main/mcp/` — the server the
 * feature's three channels read and write is a thin forwarder over it,
 * mirroring `video-handlers.ts`'s own shape for `videoRootGet`/`videoRootSet`.
 */

/**
 * `enabled` and the allow switches are independent controls sharing one channel
 * — a request touches only the field its own switch means to change, and
 * whichever is absent keeps its current persisted value (each setter reads the
 * other from module state before writing). Applying `enabled` first means a
 * request that (unusually) sent both lands with the master switch's own side
 * effects (starting/stopping the socket) settled before the narrower one is
 * persisted. The first setter to fail answers the status with its message.
 */
const SWITCHES = [
  ['enabled', setMcpEnabled],
  ['allowUi', setMcpAllowUi],
  ['allowGateDecide', setMcpAllowGateDecide],
  ['allowModels', setMcpAllowModels],
  ['allowGames', setMcpAllowGames],
  ['allowTerrains', setMcpAllowTerrains],
  ['allowSprites', setMcpAllowSprites],
  ['allowMaps', setMcpAllowMaps],
  ['allowMusic', setMcpAllowMusic],
  ['allowCompanionSettings', setMcpAllowCompanionSettings],
] as const satisfies readonly (readonly [keyof McpToolsSetRequest, (next: boolean) => Promise<{ ok: true } | { ok: false; message: string }>])[];

const studioMcpServer: McpToolsServer = {
  status: () => getMcpStatus(),
  async set(request) {
    for (const [field, setter] of SWITCHES) {
      const next = request[field];
      if (next === undefined) continue;
      const result = await setter(next);
      if (!result.ok) return { ...getMcpStatus(), error: result.message };
    }
    return getMcpStatus();
  },
  calls: () => getMcpCallLog(),
};

export function registerMcpHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('the MCP tools never trash')),
  };
  mcpToolsMain.register(ctx, { server: studioMcpServer });
}
