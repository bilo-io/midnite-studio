import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useTerminalStore } from './terminal-store';

/**
 * Adopts every `agent`/`script` workflow node's session as main announces it
 * (Phase 95 Theme J) — the renderer half of `node-sessions.ts`'s
 * `workflowNodeSessionStarted` push. Mounted once, from `App`, the same way
 * `useSessionExits` is: a workflow can run with the terminal panel closed
 * and the Sessions view unmounted, and the very first node's session must
 * still land in the store so the accordion group and the canvas node's glow
 * have something to read the moment either is opened.
 */
export function useWorkflowNodeSessions(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    return api.workflow.onNodeSessionStarted(({ session, live }) => {
      useTerminalStore.getState().adoptSession(session, live.ptyId);
    });
  }, []);
}
