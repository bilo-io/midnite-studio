import { join } from 'node:path';

import { app } from 'electron';

import { recordAudit } from '../agent-audit';
import { mcpShimScriptPath } from '../mcp';
import { startMcpServer } from '../mcp/server';
import { createProfileMcpSockets, type ProfileMcpSockets } from './profile-mcp-sockets';

/**
 * Studio's one set of custom-agent sockets (Phase 154 Theme G), bound to the real server, shim and audit
 * trail. Created on first use, which is always after `app.whenReady()` (a launch or a pty create).
 */
let sockets: ProfileMcpSockets | null = null;

export function studioProfileMcpSockets(): ProfileMcpSockets {
  sockets ??= createProfileMcpSockets({
    runsDir: () => join(app.getPath('userData'), 'mcp-runs'),
    startServer: ({ socketPath, gate, sessionId }) =>
      startMcpServer({
        userDataDir: app.getPath('userData'),
        appVersion: app.getVersion(),
        buildId: 'profile-run',
        isPackaged: app.isPackaged,
        socketPath,
        sessionId,
        ...(gate ? { gate } : {}),
      }),
    // The shim bundle runs under the app's own binary as plain node, as `iterative-host.ts` launches it.
    shimLaunch: (socketPath, toolArgs) => ({
      command: process.execPath,
      args: [mcpShimScriptPath(), '--socket', socketPath, ...toolArgs],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),
    recordAudit,
  });
  return sockets;
}

/** App quit: close every socket, bound or not. */
export async function closeStudioProfileMcpSockets(): Promise<void> {
  await sockets?.closeAll();
}
