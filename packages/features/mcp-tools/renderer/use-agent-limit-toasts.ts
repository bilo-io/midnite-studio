import { useEffect } from 'react';

import { bridge, useToastStore } from '@midnite/studio-frame';
import { AGENT_LIMIT_LABELS, type AgentLimitResolveRequest, type AgentLimitTrip } from '@midnite/studio-shared';

/**
 * The notification bell's "an agent was paused" entry (Phase 121 Theme F) — mounted once from the app root,
 * for the reason `useWaitingGateToasts` is: a trip lands while any view is up. Main has already interrupted
 * the session; the entry stays in the bell until it is answered, and offers **Resume**, **Stop** and
 * **Raise limit for this session** (`agentLimits.resolve`). Answering removes it; so does a stale answer
 * (the trip was already answered, or the session is gone), because the entry would only lie.
 */
export function useAgentLimitToasts(): void {
  useEffect(() => {
    const api = bridge();
    if (!api?.agentLimits) return undefined;
    return api.agentLimits.onTripped((trip: AgentLimitTrip) => {
      const id = crypto.randomUUID();
      const answer = (action: AgentLimitResolveRequest['action']) => () => {
        useToastStore.getState().removeToast(id);
        void api.agentLimits.resolve({ tripId: trip.id, action });
      };
      useToastStore.setState((state) => ({
        toasts: [
          ...state.toasts,
          {
            id,
            message: `${trip.message} Raise it only if this was expected (${AGENT_LIMIT_LABELS[trip.limit]}).`,
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
