import type { ChatSummary, RepoDescriptor, TerminalSession } from '@midnite/studio-shared';
import { useEffect, useMemo } from 'react';

import { bridge } from '../../services/bridge';
import { useRepos } from '../../services/queries';
import { useChatsStore } from '../chats/chats-store';
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
export type ActiveAgentWorktreeSession =
  | {
      session: TerminalSession;
      chat?: undefined;
      /**
       * `resolveSessionAgentId(session, liveAgentId)`'s own result — the
       * *resolved* agent id, so a plain shell probed into running `codex` shows
       * Codex's mark rather than falling back to Claude's.
       */
      agentId: string | undefined;
    }
  | {
      /** A Chats turn running in the chat's own worktree — "Reveal" opens the chat. */
      chat: { id: string; title: string };
      session?: undefined;
      agentId: string | undefined;
    };

/**
 * Pure resolver: the worktrees a Chats turn is running in right now, each
 * mapped to its chat. A chat's worktree is an ordinary linked worktree, so it
 * wears the same avatar a terminal agent's would.
 */
export function activeChatWorktreeSessions(chats: readonly ChatSummary[]): Map<string, ActiveAgentWorktreeSession> {
  const active = new Map<string, ActiveAgentWorktreeSession>();
  for (const chat of chats) {
    if (!chat.running || !chat.worktree || active.has(chat.worktree.path)) continue;
    active.set(chat.worktree.path, { chat: { id: chat.id, title: chat.title }, agentId: chat.engine });
  }
  return active;
}

/**
 * Running chats with a worktree. Keeps the chat list fresh on its own — the
 * Chats page's event subscription only lives while that page is mounted, and a
 * turn finishing while you watch the graph must take its avatar away.
 */
function useRunningChatWorktrees(): Map<string, ActiveAgentWorktreeSession> {
  const chats = useChatsStore((s) => s.list);
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    void useChatsStore.getState().refreshList();
    return api.chats.onEvent((event) => {
      if (event.kind === 'chat' || event.kind === 'removed') void useChatsStore.getState().refreshList();
    });
  }, []);
  return useMemo(() => activeChatWorktreeSessions(chats), [chats]);
}

/** Terminal sessions first (they were there first), then running chats. */
function withChats(
  terminal: Map<string, ActiveAgentWorktreeSession>,
  chats: Map<string, ActiveAgentWorktreeSession>,
): Map<string, ActiveAgentWorktreeSession> {
  if (chats.size === 0) return terminal;
  const merged = new Map(terminal);
  for (const [path, occupant] of chats) if (!merged.has(path)) merged.set(path, occupant);
  return merged;
}

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
  const sessions = useActiveAgentWorktreeSessions();
  return useMemo(() => new Set(sessions.keys()), [sessions]);
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
  const chats = useRunningChatWorktrees();

  return useMemo(
    () => withChats(activeAgentWorktreeSessions(sessions, states, liveAgentId, liveCwd, repos), chats),
    [sessions, states, liveAgentId, liveCwd, repos, chats],
  );
}
