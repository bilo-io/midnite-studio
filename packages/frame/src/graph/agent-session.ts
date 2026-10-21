import type { TerminalSession } from '@midnite/studio-shared';

/**
 * One live agent session bound to a worktree — the ref badge's avatar needs
 * more than the boolean "an agent is active here": which session
 * "Reveal session" should open, and which agent's mark to draw.
 *
 * Declared in the frame (Phase 113 Theme O) because the graph's rows carry it; only Studio, which
 * has terminals and chats, ever produces one (`features/graph/use-agent-worktrees.ts`, through the
 * `GitHost` port's `useAgentWorktreeSessions`).
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
