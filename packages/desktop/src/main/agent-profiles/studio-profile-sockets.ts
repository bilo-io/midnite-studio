import { join } from 'node:path';

import { app } from 'electron';

import { recordAudit } from '../agent-audit';
import { livePtyFor } from '../pty-service';
import { mcpShimScriptPath } from '../mcp';
import { startMcpServer } from '../mcp/server';
import { createProfileMcpSockets, type ProfileMcpSockets } from './profile-mcp-sockets';

/**
 * Studio's one set of custom-agent sockets (Phase 154 Theme G), bound to the real server, shim and audit
 * trail. Created when the handlers register, inside `app.whenReady()`; every path it reads is lazy.
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

/**
 * App quit: stop every socket, keeping the manifests of bound ones (#1697) — the pty broker can keep their
 * sessions alive, and the next start's `restoreStudioProfileMcpSockets` brings the sockets back for them.
 */
export async function closeStudioProfileMcpSockets(): Promise<void> {
  await sockets?.suspendAll();
}

/**
 * After the pty service has adopted the broker's surviving sessions (boot, and a detached-session recovery):
 * the private socket of every custom-agent session still live comes back on its old path (#1697). The
 * breaker's limits need nothing: they key on the session row's `profileId`, which is persisted.
 */
export async function restoreStudioProfileMcpSockets(): Promise<string[]> {
  return studioProfileMcpSockets().restore((sessionId) => livePtyFor(sessionId) !== null);
}
