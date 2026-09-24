import type { RepoDescriptor, TerminalSession } from '@midnite/studio-shared';
import { useMemo } from 'react';

import { useRepos } from '../../services/queries';
import {
  isAgentRow,
  resolveSessionAgentId,
  sessionPhase,
  useTerminalStore,
  type ConnectionState,
} from '../terminal/terminal-store';
import { resolveRepoForPath } from '../terminal/resolve-repo-for-path';

/**
 * One live agent session bound to a worktree — the ref badge's avatar needs
 * more than the boolean `activeAgentWorktreePaths` gives it: which session
 * "Reveal session" should open, and which agent's mark to draw.
 */
export type ActiveAgentWorktreeSession = {
  session: TerminalSession;
  /**
   * `resolveSessionAgentId(session, liveAgentId)`'s own result — the
   * *resolved* agent id, so a plain shell probed into running `codex` shows
   * Codex's mark rather than falling back to Claude's.
   */
  agentId: string | undefined;
};

/**
 * Pure resolver: given sessions, their connection states, live agent ids, and
 * known repositories, returns the checkout roots (worktree paths and main repo paths)
 * where an agent is actively running in a live session, each mapped to that
 * session (first one found wins — today's UI shows at most one avatar per ref).
 */
export function activeAgentWorktreeSessions(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
  liveAgentId: Record<string, string | null>,
  liveCwd: Record<string, string | undefined>,
  repos: readonly RepoDescriptor[] | undefined,
): Map<string, ActiveAgentWorktreeSession> {
  const activeSessions = new Map<string, ActiveAgentWorktreeSession>();
  if (!repos || repos.length === 0) return activeSessions;

  for (const session of sessions) {
    if (!isAgentRow(session, liveAgentId)) continue;
    if (sessionPhase(session, states[session.id]) !== 'live') continue;

    const currentPath = liveCwd[session.id] ?? session.cwd;
    const resolved = resolveRepoForPath(currentPath, repos);
    if (resolved?.root && !activeSessions.has(resolved.root)) {
      activeSessions.set(resolved.root, {
        session,
        agentId: resolveSessionAgentId(session, liveAgentId),
      });
    }
  }

  return activeSessions;
}

/**
 * Pure resolver: the set of checkout roots (worktree paths and main repo
 * paths) where an agent is actively running in a live session — the boolean
 * shape most callers (the ref badge's glow) only need.
 */
export function activeAgentWorktreePaths(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
  liveAgentId: Record<string, string | null>,
  liveCwd: Record<string, string | undefined>,
  repos: readonly RepoDescriptor[] | undefined,
): Set<string> {
  return new Set(
    activeAgentWorktreeSessions(sessions, states, liveAgentId, liveCwd, repos).keys(),
  );
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

/**
 * React hook returning, per worktree path, the live agent session working
 * there — the ref badge's avatar and its "Reveal session" action read this
 * rather than the plain boolean {@link useActiveAgentWorktreePaths} gives.
 */
export function useActiveAgentWorktreeSessions(): Map<string, ActiveAgentWorktreeSession> {
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const liveCwd = useTerminalStore((s) => s.liveCwd);
  const { data: repos } = useRepos();

  return useMemo(
    () => activeAgentWorktreeSessions(sessions, states, liveAgentId, liveCwd, repos),
    [sessions, states, liveAgentId, liveCwd, repos],
  );
}
