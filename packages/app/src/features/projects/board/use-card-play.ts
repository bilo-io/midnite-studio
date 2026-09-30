import { useCallback } from 'react';

import { BUILTIN_AGENTS, type ForgeProjectItem } from '@midnite/studio-shared';

import { useUiStore } from '../../../store/ui-store';
import { resolveSessionAttribution } from '../../terminal/session-attribution';
import { revealSession } from '../../terminal/reveal-session';
import { startAgent } from '../../terminal/start-agent';
import { useTerminalStore } from '../../terminal/terminal-store';
import { composeCardPrompt, composeSkillLaunchPrompt, resolveMostRecentAgentId } from './board-derive';
import { defaultCardSkill } from './card-skill';

/**
 * The Play button's whole logic (Phase 92 Theme A) — one hook shared by
 * `TaskCard`'s own button and `ProjectGraphNode`'s copy of it, which were
 * identical down to the `BUILTIN_AGENTS`-scanning most-recent-agent
 * fallback. Resolve the most-recently-used agent, compose the prompt, call
 * `startAgent`, then `revealSession` — or, if a session is already bound to
 * this card, just reveal it.
 *
 * **Launches with the card's skill text, verbatim.** `CardDetail`'s picker
 * (`card-skill-picker.tsx`) always holds a value — the card's stored
 * `cardSkillByTask` entry, else `defaultCardSkill`'s rule (the most recently
 * used skill on any card, else `/midnite-create-adhoc` for an ad hoc card,
 * else `/midnite-create`) — and Play resolves the very same value, so what
 * the picker shows is exactly what gets sent: `<text> <card url>`, one
 * shell-quoted argument (`startAgent` → `shellQuote`). Free text with args
 * (`/midnite-create 98 D`) goes through as typed. This retires Phase 92
 * Theme D's three-entry fallback menu, which only existed to give an unset
 * card its first choice — there is no unset card any more.
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
}): {
  onPlay: (event: { clientX: number; clientY: number; stopPropagation: () => void }) => void;
} {
  const sessions = useTerminalStore((s) => s.sessions);
  const agentSkills = useUiStore((s) => s.agentSkills);
  const cardSkillByTask = useUiStore((s) => s.cardSkillByTask);
  const taskKey = `${taskRef.projectId}:${taskRef.itemId}`;

  const onPlay = useCallback(
    (event: { clientX: number; clientY: number; stopPropagation: () => void }) => {
      event.stopPropagation();
      if (sessionId !== undefined) {
        revealSession(sessionId);
        return;
      }
      if (!item) return;

      const targetCwd = worktreePath ?? '';
      const skillText = defaultCardSkill({ item, taskKey, cardSkillByTask, agentSkills }).trim();
      const prompt =
        skillText === ''
          ? composeCardPrompt(item, targetCwd)
          : composeSkillLaunchPrompt(item, skillText);
      const agentId = resolveMostRecentAgentId(sessions, repoId);
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
        ...resolveSessionAttribution(taskRef.projectId),
        autoSend: true,
      });
      revealSession(session.id);
    },
    [sessionId, item, worktreePath, taskKey, cardSkillByTask, agentSkills, sessions, repoId, taskRef],
  );

  return { onPlay };
}
