import { BUILTIN_AGENTS, type AgentDefinition, type AgentStatus } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';

import { bridge, hasBridge } from '../../services/bridge';

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
 */
export type AgentRoster = { agents: AgentDefinition[]; status: AgentStatus[] };

/** The builtins with nothing known about them — the shape every fallback takes. */
const UNPROBED: AgentRoster = { agents: [...BUILTIN_AGENTS], status: [] };

export function useAgents(): AgentRoster {
  const { data } = useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<AgentRoster> => {
      const result = await bridge()?.agent.list();
      return result ? { agents: result.agents, status: result.status } : UNPROBED;
    },
    enabled: hasBridge(),
  });
  return data ?? UNPROBED;
}
