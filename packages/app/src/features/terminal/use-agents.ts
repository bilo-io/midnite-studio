import {
  BUILTIN_AGENTS,
  type AgentDefinition,
  type AgentProbeState,
  type AgentStatus,
} from '@midnite/studio-shared';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useMemo } from 'react';

import { bridge, hasBridge } from '../../services/bridge';
import { ensureAgentProbeSubscription, useAgentProbeStore } from '../agent/agent-probe-store';

/**
 * The agent roster, and what main could learn about it on this machine.
 *
 * **One hook, because there is one cache entry.** React Query keys by key, not
 * by `queryFn`: two components querying `['agents']` with different-shaped
 * query functions share whichever answer was fetched first, and the other one
 * destructures a shape it was never written for. That was a live crash for
 * about an hour — the terminal panel started returning `{ agents, status }`
 * while the Settings ▸ Terminal page still returned a bare array, so opening
 * one before the other white-screened it. Both now read through here.
 *
 * Queried rather than imported so an edit to `agents.json` shows up on the next
 * launch without a rebuild. The builtins are the placeholder while it loads,
 * and the fallback when there is no bridge at all (jsdom, the e2e harness) —
 * with an EMPTY status, because "we never asked" and "it is not installed" are
 * different facts and only one of them may grey out a menu item.
 *
 * **Install status is not in the query.** It lives in one zustand store
 * (`features/agent/agent-probe-store.ts`) fed by main's startup probe and its
 * `agent.onStatus` pushes, so a reload or a TTL refresh reaches every consumer
 * at once and no consumer can probe on its own. `probe` says where that stands:
 * `checking` (no answer yet), `ready`, or `unknown` (probe errored — assume it
 * works, but say so).
 */
export type AgentRoster = {
  agents: AgentDefinition[];
  status: AgentStatus[];
  probe: AgentProbeState;
};

/** The builtins with nothing known about them — the shape every fallback takes. */
const BUILTIN_ROSTER = [...BUILTIN_AGENTS];

/**
 * Only ever used when no `QueryClientProvider` is above the caller. The agent
 * avatar (`components/agent-avatar.tsx`) sits on Projects cards and graph
 * nodes, which many tests mount bare. Without a provider there is no bridge to
 * ask either, so the query stays disabled and the builtins are the answer,
 * exactly as they are under jsdom with one.
 */
const NO_PROVIDER_CLIENT = new QueryClient();

export function useAgents(): AgentRoster {
  const client = useContext(QueryClientContext) ?? NO_PROVIDER_CLIENT;
  const { data } = useQuery(
    {
      queryKey: ['agents'],
      queryFn: async (): Promise<AgentDefinition[]> => {
        const result = await bridge()?.agent.list();
        if (!result) return BUILTIN_ROSTER;
        useAgentProbeStore.getState().seed({ status: result.status, probe: result.probe });
        return result.agents;
      },
      enabled: hasBridge(),
    },
    client,
  );
  useEffect(() => {
    ensureAgentProbeSubscription();
  }, []);
  const status = useAgentProbeStore((s) => s.status);
  const storeProbe = useAgentProbeStore((s) => s.probe);
  // No bridge, nothing was ever asked: not "checking" (it would never end).
  const probe: AgentProbeState = hasBridge() ? storeProbe : 'unknown';
  const agents = data ?? BUILTIN_ROSTER;
  // Stable identity: callers hand the whole roster to effect deps.
  return useMemo(() => ({ agents, status, probe }), [agents, status, probe]);
}
