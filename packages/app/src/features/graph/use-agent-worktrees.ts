import type { RepoDescriptor, TerminalSession } from '@midnite/studio-shared';
import { useMemo } from 'react';

import { useRepos } from '../../services/queries';
import {
  isAgentRow,
  sessionPhase,
  useTerminalStore,
  type ConnectionState,
} from '../terminal/terminal-store';
import { resolveRepoForPath } from '../terminal/resolve-repo-for-path';

/**
 * Pure resolver: given sessions, their connection states, live agent ids, and
 * known repositories, returns the set of checkout roots (worktree paths and main repo paths)
 * where an agent is actively running in a live session.
 */
export function activeAgentWorktreePaths(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
  liveAgentId: Record<string, string | null>,
  liveCwd: Record<string, string | undefined>,
  repos: readonly RepoDescriptor[] | undefined,
): Set<string> {
  const activePaths = new Set<string>();
  if (!repos || repos.length === 0) return activePaths;

  for (const session of sessions) {
    if (!isAgentRow(session, liveAgentId)) continue;
    if (sessionPhase(session, states[session.id]) !== 'live') continue;

    const currentPath = liveCwd[session.id] ?? session.cwd;
    const resolved = resolveRepoForPath(currentPath, repos);
    if (resolved?.root) {
      activePaths.add(resolved.root);
    }
  }

  return activePaths;
}

/**
 * React hook returning the set of worktree paths where a live agent is currently working.
 */
export function useActiveAgentWorktreePaths(): Set<string> {
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const liveCwd = useTerminalStore((s) => s.liveCwd);
  const { data: repos } = useRepos();

  return useMemo(
    () => activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos),
    [sessions, states, liveAgentId, liveCwd, repos],
  );
}
