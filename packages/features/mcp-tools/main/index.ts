import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, schemas, type McpCallEntry } from '@midnite/studio-shared';
import type { z } from 'zod';

import { mcpToolsManifest } from '../manifest';

export { mcpToolsManifest, type McpToolsManifest } from '../manifest';

/** What `mcp:get` answers — the enable flag, whether the socket is up, and every allow switch. */
export type McpToolsStatus = z.infer<typeof schemas.McpGetResponse>;
/** What `mcp:set` answers: the status after the change, and `error` when turning a switch on failed to bind. */
export type McpToolsSetResult = McpToolsStatus & { error?: string };
export type McpToolsSetRequest = z.output<typeof schemas.McpSetRequest>;

/**
 * The server the Tools view reads and writes (Phase 113 Theme N). The MCP
 * server is Studio's today; this is the seam between it and the three channels,
 * so an app that has no server of its own (Agents) can still answer the view —
 * with a server that reports itself as off — instead of leaving the channels
 * unregistered.
 */
export type McpToolsServer = {
  status(): McpToolsStatus;
  /** Applies the fields the request carries, persisting each before acting; an absent field keeps its value. */
  set(request: McpToolsSetRequest): Promise<McpToolsSetResult>;
  /** The last tool calls, newest first. */
  calls(): McpCallEntry[];
};

export type McpToolsMainServices = { server: McpToolsServer };

/**
 * A server that is never running and refuses every change — what an app with no
 * MCP server of its own installs. The view reads `running: false` and `shimPath: null`
 * and renders its "this app has no server" state; `set` answers the same status with
 * the reason, so a stray caller sees why instead of a silent no-op.
 */
export function createNoMcpServer(reason = 'This app does not run the MCP server.'): McpToolsServer {
  const status: McpToolsStatus = {
    enabled: false,
    running: false,
    socketPath: null,
    shimPath: null,
    allowUi: false,
    allowGateDecide: false,
    allowModels: false,
    allowGames: false,
    allowTerrains: false,
    allowSprites: false,
    allowMaps: false,
    allowMusic: false,
    allowCompanionSettings: false,
  };
  return {
    status: () => status,
    set: async () => ({ ...status, error: reason }),
    calls: () => [],
  };
}

export const mcpToolsMain = defineFeatureMain<McpToolsMainServices>({
  feature: mcpToolsManifest.feature,
  channels: mcpToolsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { server } = services;

    ipc.handleBare(CHANNELS.mcpGet, () => server.status());
    ipc.handle(
      CHANNELS.mcpSet,
      schemas.McpSetRequest,
      (request) => server.set(request),
      () => ({ ...server.status(), error: 'invalid request' }),
    );
    ipc.handleBare(CHANNELS.mcpCalls, () => ({ calls: server.calls() }));
  },
});
