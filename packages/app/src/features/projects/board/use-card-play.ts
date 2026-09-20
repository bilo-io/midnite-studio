import { useCallback } from 'react';

import { BUILTIN_AGENTS, type ForgeProjectItem } from '@midnite/studio-shared';

import { revealSession } from '../../terminal/reveal-session';
import { startAgent } from '../../terminal/start-agent';
import { useTerminalStore } from '../../terminal/terminal-store';
import { composeCardPrompt } from './board-derive';

/**
 * The Play button's whole logic (Phase 92 Theme A) — one hook shared by
 * `TaskCard`'s own button and `ProjectGraphNode`'s copy of it, which were
 * identical down to the `BUILTIN_AGENTS`-scanning most-recent-agent
 * fallback. Resolve the most-recently-used agent, compose the prompt, call
 * `startAgent`, then `revealSession` — or, if a session is already bound to
 * this card, just reveal it.
 *
 * **Takes the caller's already-derived `sessionId` rather than re-deriving
 * it** — `TaskCard` gets its via `useCardStatus`, `ProjectGraphNode` via
 * `findCardSession` directly (it already needs the live session object for
 * its own glow/ring state, so re-deriving it here would be a second read of
 * the same store slice). This keeps the "when does the button reveal versus
 * launch" behaviour exactly as it was pre-extraction, in both callers.
 *
 * `item` is optional because `ProjectGraphNode` renders for foreign nodes
 * with no item at all — the Play button itself is never shown in that case,
 * but the hook must still be callable unconditionally (rules of hooks), so
 * `onPlay` is a no-op past `stopPropagation` when there is nothing to launch.
 */
export function useCardPlay({
  item,
  repoId,
  worktreePath,
  taskRef,
  sessionId,
}: {
  item: ForgeProjectItem | undefined;
  repoId: string | null | undefined;
  worktreePath: string | null | undefined;
  taskRef: { projectId: string; itemId: string };
  /** The live session already bound to this card, if any — `undefined` means "not running". */
  sessionId: string | undefined;
}): { onPlay: (event: { stopPropagation: () => void }) => void } {
  const sessions = useTerminalStore((s) => s.sessions);

  const onPlay = useCallback(
    (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      if (sessionId !== undefined) {
        revealSession(sessionId);
        return;
      }
      if (!item) return;

      const targetCwd = worktreePath ?? '';
      const prompt = composeCardPrompt(item, targetCwd);
      const mostRecent = sessions
        .filter((s) => s.repoId === repoId && s.kind === 'agent' && s.agentId !== undefined)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const agentId = mostRecent?.agentId ?? BUILTIN_AGENTS[0]?.id ?? 'claude';
      const agent = BUILTIN_AGENTS.find((a) => a.id === agentId) ?? BUILTIN_AGENTS[0]!;

      const session = startAgent({
        repoId: repoId ?? '',
        cwd: targetCwd,
        title: item.content.title,
        prompt,
        agentId: agent.id,
        command: agent.command,
        surface: 'kanban',
        taskRef,
        autoSend: true,
      });
      revealSession(session.id);
    },
    [sessionId, item, worktreePath, sessions, repoId, taskRef],
  );

  return { onPlay };
}
