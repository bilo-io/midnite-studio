import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { agentProfilesQueryOptions } from '@midnite/studio-feature-agent-profiles/renderer';
import {
  launchProfileSession,
  useTerminalStore,
  type PrepareProfileLaunch,
} from '@midnite/studio-feature-terminal/renderer';
import { bridge, noBridge, reportFailure } from '@midnite/studio-frame';
import { AGENT_PROFILE_NOT_FOUND, type AgentProfile } from '@midnite/studio-shared';

import { revealSession } from '../features/terminal/reveal-session';
import { useRepos } from '../services/queries';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's custom-agent launch (Phase 154 Theme F): main builds the line; a failed envelope is reported
 * as a toast and answers `null`, so the caller opens nothing.
 */
export const studioPrepareProfileLaunch: PrepareProfileLaunch = async (req) => {
  const result = (await bridge()?.agentProfile.prepareLaunch(req)) ?? noBridge<{ launchId: string; line: string }>();
  if (!result.ok) {
    // A deleted agent is not a failure to report: its sessions go on as the base CLI (Decision 13).
    if (result.kind === 'error' && result.message === AGENT_PROFILE_NOT_FOUND) return 'missing';
    reportFailure(result);
    return null;
  }
  return result.value;
};

export const OPEN_A_REPO_FIRST = 'Open a repo first.';

/** The Agents page's Launch: a session in the selected worktree, then the terminal panel revealed on it. */
export function useStudioLaunchProfile(): { launch: (profile: AgentProfile) => Promise<void>; disabledReason: string | null } {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const cwd = useUiStore((s) => s.selectedWorktreePath);
  const { data: repos } = useRepos();
  const repoName = repos?.find((repo) => repo.id === repoId)?.name ?? 'terminal';
  return {
    launch: async (profile) => {
      if (!repoId || !cwd) return;
      const session = await launchProfileSession(studioPrepareProfileLaunch, profile, { repoId, cwd, title: repoName });
      if (session) revealSession(session.id);
    },
    disabledReason: repoId && cwd ? null : OPEN_A_REPO_FIRST,
  };
}

/** How many of a custom agent's sessions have a live pty right now. */
export function useStudioLiveSessionCount(profileId: string): number {
  return useTerminalStore(
    (s) => s.sessions.filter((session) => session.profileId === profileId && s.ptyIds[session.id] !== undefined).length,
  );
}

const NO_PROFILES: AgentProfile[] = [];
/** Only for a terminal rendered with no query provider (a bare component test): no retries, no shared cache. */
const FALLBACK_CLIENT = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * The saved custom agents for the terminal's `+` menu and session chrome — the Agents page's own query,
 * so a save there shows up here. A failed read lists none. Tolerates a missing `QueryClientProvider`: every terminal
 * component test renders without one.
 */
export function useStudioAgentProfiles(): AgentProfile[] {
  const client = useContext(QueryClientContext) ?? FALLBACK_CLIENT;
  const query = useQuery(agentProfilesQueryOptions(), client);
  return query.data ?? NO_PROFILES;
}
