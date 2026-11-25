import { terminalMain } from '@midnite/studio-feature-terminal/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { defaultLogger } from '../log';
import { agentProbe } from '../agent-probe-runtime';
// Binds the terminal service's pty, locator and log ports (a side effect of the shim) before any handler runs.
import '../terminal-service';
import { getBrokerStatus } from '../pty-service';
import { restoreStudioProfileMcpSockets, studioProfileMcpSockets } from '../agent-profiles/studio-profile-sockets';
import { handle, handleBare, handleSend, handleSendFromSender } from './handle';

/**
 * The durable half of the terminal — session rows, not processes. The handlers are the terminal
 * feature's main half (Phase 123 Theme E.3), pty channels included; this is Studio's composition of it.
 */
export function registerTerminalHandlers(): void {
  // Nothing the terminal registers pushes an event or trashes a file; both are refused loudly.
  const ctx: FeatureMainContext = {
    ipc: {
      handle,
      handleBare,
      send: handleSend,
      sendFromSender: (channel, schema, handler, onInvalid) =>
        handleSendFromSender(channel, schema, (payload, win) => handler(payload, win), onInvalid),
    },
    emit: () => {
      throw new Error('terminal handlers never emit');
    },
    trashItem: () => Promise.reject(new Error('terminal never trashes')),
  };
  terminalMain.register(ctx, {
    brokerStatus: getBrokerStatus,
    agentProbe: () => agentProbe(),
    warn: (issue) => defaultLogger.warn(issue),
    // #1697: `ensureBound` starts an expired launch's socket again, for a queued line a late view types.
    bindProfileLaunch: (launchId, sessionId) =>
      studioProfileMcpSockets()
        .ensureBound(launchId, sessionId)
        .catch((error: unknown) => {
          defaultLogger.warn(`agent profile socket: ${String(error)}`);
          return false;
        }),
    releaseProfileLaunch: (launchId) => {
      void studioProfileMcpSockets()
        .close(launchId)
        .catch((error: unknown) => defaultLogger.warn(`agent profile socket: ${String(error)}`));
    },
    restoreProfileLaunches: restoreStudioProfileMcpSockets,
  });
}
