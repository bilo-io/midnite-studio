import { useEffect } from 'react';

import { bridge, useToastStore } from '@midnite/studio-frame';
import { type AgentLimitResolveRequest, type AgentLimitTrip } from '@midnite/studio-shared';

/**
 * The notification bell's "an agent was paused" entry (Phase 121 Theme F) — mounted once from the app root,
 * for the reason `useWaitingGateToasts` is: a trip lands while any view is up. Main has already interrupted
 * the session; the entry stays in the bell until it is answered (and the breaker re-arms by itself after ten minutes, in case this window never saw it), and offers **Resume**, **Stop** and
 * **Raise limit for this session** (`agentLimits.resolve`). Answering removes it, and so does a stale answer
 * (already answered, or the session is gone), because the entry would only lie.
 */
export function useAgentLimitToasts(): void {
  useEffect(() => {
    const api = bridge();
    if (!api?.agentLimits) return undefined;
    return api.agentLimits.onTripped((trip: AgentLimitTrip) => {
      const id = crypto.randomUUID();
      const answer = (action: AgentLimitResolveRequest['action']) => () => {
        // The entry goes once main has answered (ok or "already answered"); a rejected call keeps it so the user can retry.
        void api.agentLimits
          .resolve({ tripId: trip.id, action })
          .then(() => useToastStore.getState().removeToast(id))
          .catch(() => undefined);
      };
      useToastStore.setState((state) => ({
        toasts: [
          ...state.toasts,
          {
            id,
            message: trip.message,
            status: 'warning',
            action: { label: 'Resume', onAction: answer('resume') },
            extraActions: [
              { label: 'Stop', onAction: answer('stop') },
              { label: 'Raise limit for this session', onAction: answer('raise') },
            ],
          },
        ],
      }));
    });
  }, []);
}
