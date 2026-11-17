import { join } from 'node:path';

import { MCP_LIST_TOOLS_REQUEST, type McpToolId } from '@midnite/studio-shared';

import type { ScopedDispatch } from '../agent-run/host';
import { mcpSocketName } from './socket-name';
import { startMcpSocketServer, type StartMcpSocketServerResult } from './socket-server';

/**
 * A suite app's own MCP server (Phase 153 Theme B): `startMcpSocketServer` on
 * `<userData>/mcp/<mcpSocketName(…)>`, with Studio's per-launch token scheme (`requireToken`, the token
 * written beside the socket), answering two things — {@link MCP_LIST_TOOLS_REQUEST} with `{ tools: ids }`
 * from `listTools()`, and every other tool name through `dispatch`. The `midnite` shim reads each app's
 * token the way it reads Studio's (`readSocketToken(socketPath)`), so nothing about auth is app-specific.
 *
 * Studio's own server (`desktop/src/main/mcp/server.ts`) is not moved onto this: it carries an audit ring,
 * a listing filter and a run guard that are Studio's, so the move would not be a pure one.
 */
export type StartAppMcpServerOptions = {
  userDataDir: string;
  appVersion: string;
  buildId: string;
  isPackaged: boolean;
  dispatch: ScopedDispatch;
  /** The tools this app serves right now; re-read on every list request, so a consent switch takes effect live. */
  listTools: () => readonly McpToolId[];
  log?: (line: string) => void;
  /** Test seam: skip the `<userData>/mcp/<name>` layout and bind exactly here. */
  socketPath?: string;
};

export function startAppMcpServer(opts: StartAppMcpServerOptions): Promise<StartMcpSocketServerResult> {
  const socketPath = opts.socketPath ?? join(opts.userDataDir, 'mcp', mcpSocketName(opts.appVersion, opts.buildId, opts.isPackaged));
  const dispatch: ScopedDispatch = async (tool, input) => {
    if (tool === MCP_LIST_TOOLS_REQUEST) return { ok: true, value: { tools: [...opts.listTools()] } };
    return opts.dispatch(tool, input);
  };
  return startMcpSocketServer({ socketPath, dispatch, requireToken: true, ...(opts.log ? { log: opts.log } : {}) });
}
