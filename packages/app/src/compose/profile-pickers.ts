import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext, useMemo } from 'react';

import { agentProfilesQueryOptions } from '@midnite/studio-feature-agent-profiles/renderer';
import { useTerminalStore } from '@midnite/studio-feature-terminal/renderer';
import { toAgentPrompt, type AgentProfile } from '@midnite/studio-shared';

import { useUiStore } from '../store/ui-store';
import { studioPrepareProfileLaunch } from './profile-launch';

/** Only for a view rendered with no query provider (a bare component test): no retries, no shared cache. */
const FALLBACK_CLIENT = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * The saved custom agents for a workflow node's or a loop's picker (#1699), sorted by name — the Agents
 * page's own query. `undefined` until it has loaded, so a saved choice is not called deleted before then.
 */
export function useStudioAgentProfilesForPicker(): readonly AgentProfile[] | undefined {
  const data = useQuery(agentProfilesQueryOptions(), useContext(QueryClientContext) ?? FALLBACK_CLIENT).data;
  return useMemo(() => (data ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : undefined), [data]);
}

/**
 * A loop's Start under a custom agent (#1699): main builds the typed line with the loop's composed prompt
 * as its first prompt, and the session is stamped with the loop so it lists under the terminal's "Loops"
 * group. Answers the session id, `'missing'` when the agent was deleted (the caller starts the base CLI),
 * or `null` for a failure already reported.
 */
export async function startStudioLoopProfileSession(input: {
  profileId: string;
  baseAgentId: string;
  repoId: string;
  cwd: string;
  title: string;
  prompt: string;
  loopId: string;
  autoSend: boolean;
}): Promise<string | 'missing' | null> {
  const prepared = await studioPrepareProfileLaunch({
    profileId: input.profileId,
    cwd: input.cwd,
    resume: false,
    prompt: toAgentPrompt(input.prompt, input.baseAgentId),
  });
  if (prepared === 'missing' || prepared === null) return prepared;
  useUiStore.getState().setTerminalOpen(true);
  const store = useTerminalStore.getState();
  const session = store.openSession({
    kind: 'agent',
    agentId: input.baseAgentId,
    profileId: input.profileId,
    title: input.title,
    cwd: input.cwd,
    repoId: input.repoId,
    loopId: input.loopId,
  });
  store.setLaunchId(session.id, prepared.launchId);
  store.queueInput(session.id, prepared.line + (input.autoSend ? '\r' : ''));
  return session.id;
}
