import { terminalMain } from '@midnite/studio-feature-terminal/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { defaultLogger } from '../log';
import { agentProbe } from '../agent-probe-runtime';
// Binds the terminal service's pty, locator and log ports (a side effect of the shim) before any handler runs.
import '../terminal-service';
import { getBrokerStatus } from '../pty-service';
import { handle, handleBare, handleSend } from './handle';

/**
 * The durable half of the terminal — session rows, not processes. The handlers are the terminal
 * feature's main half (Phase 123 Theme E.3); this is Studio's composition of it. The pty channels stay in
 * `pty-handlers.ts` (they are sender-aware and bound to windows).
 */
export function registerTerminalHandlers(): void {
  // Nothing the terminal registers pushes an event or trashes a file; both are refused loudly.
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => {
      throw new Error('terminal handlers never emit');
    },
    trashItem: () => Promise.reject(new Error('terminal never trashes')),
  };
  terminalMain.register(ctx, {
    brokerStatus: getBrokerStatus,
    agentProbe: () => agentProbe(),
    warn: (issue) => defaultLogger.warn(issue),
  });
}
