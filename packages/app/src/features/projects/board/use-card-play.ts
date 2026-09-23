import { useCallback } from 'react';

import { BUILTIN_AGENTS, type ForgeProjectItem } from '@midnite/studio-shared';

import { useDialogs } from '../../../components/dialog-host';
import type { MenuItem } from '../../../components/context-menu';
import { DEFAULT_AGENT_SKILLS, useUiStore, type AgentCommandId } from '../../../store/ui-store';
import { AGENT_COMMANDS } from '../../agent/agent-commands';
import { revealSession } from '../../terminal/reveal-session';
import { startAgent } from '../../terminal/start-agent';
import { useTerminalStore } from '../../terminal/terminal-store';
import { composeCardPrompt, composeSkillLaunchPrompt } from './board-derive';

/**
 * The fallback menu's three entries (Phase 92 Theme D), in menu order.
 *
 * "Exec" resolves to `execAdhoc` (`/midnite-create-adhoc`), not `execBacklog`
 * (`/midnite-create`) — a Projects card is already a specific, identified
 * task, which is `execAdhoc`'s own brief ("build a one-off task described up
 * front"); `execBacklog`'s ("pick up the next unblocked backlog task")
 * presumes a `.midnite/tasks/` phase tracker a GitHub-only repo may not even
 * have. See the phase doc's own Decisions.
 */
const FALLBACK_MENU_SKILLS: readonly { id: AgentCommandId; label: string }[] = [
  { id: 'execAdhoc', label: 'Exec' },
  { id: 'brainstorm', label: 'Ideate' },
  { id: 'refine', label: 'Refine' },
];

/**
 * The Play button's whole logic (Phase 92 Theme A) — one hook shared by
 * `TaskCard`'s own button and `ProjectGraphNode`'s copy of it, which were
 * identical down to the `BUILTIN_AGENTS`-scanning most-recent-agent
 * fallback. Resolve the most-recently-used agent, compose the prompt, call
 * `startAgent`, then `revealSession` — or, if a session is already bound to
 * this card, just reveal it.
 *
 * **Forked on whether a skill is set for this card (Phase 92 Theme D).**
 * `cardSkillByTask[`${projectId}:${itemId}`]` — set from `CardDetail`'s own
 * picker (Theme C), or by a previous trip through this same fallback menu —
 * decides which of two things Play does:
 *  - **Set:** launches immediately with that skill's shrunk prompt (Theme
 *    B's `composeSkillLaunchPrompt`) — the common case once a card has been
 *    used once. No menu, no change in *when* it launches, only in what it
 *    sends.
 *  - **Unset:** opens a pointer-anchored `ContextMenu` with exactly three
 *    entries (Exec / Ideate / Refine). Picking one both launches with
 *    that skill and persists it, so a second Play on the same card skips the
 *    menu from then on — the menu is how an unset card gets its first
 *    choice, not a prompt shown every time.
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
  const taskKey = `${taskRef.projectId}:${taskRef.itemId}`;
  const skillId = useUiStore((s) => s.cardSkillByTask[taskKey]);
  const setCardSkill = useUiStore((s) => s.setCardSkill);
  const dialogs = useDialogs();

  const launchWithSkill = useCallback(
    (id: AgentCommandId) => {
      if (!item) return;

      const targetCwd = worktreePath ?? '';
      const skillTemplate = (agentSkills[id] ?? DEFAULT_AGENT_SKILLS[id] ?? '').trim();
      const prompt =
        skillTemplate === ''
          ? composeCardPrompt(item, targetCwd)
          : composeSkillLaunchPrompt(item, skillTemplate);
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
    [item, worktreePath, agentSkills, sessions, repoId, taskRef],
  );

  const onPlay = useCallback(
    (event: { clientX: number; clientY: number; stopPropagation: () => void }) => {
      event.stopPropagation();
      if (sessionId !== undefined) {
        revealSession(sessionId);
        return;
      }
      if (!item) return;

      if (skillId !== undefined) {
        launchWithSkill(skillId);
        return;
      }

      dialogs.openMenu(
        { clientX: event.clientX, clientY: event.clientY },
        FALLBACK_MENU_SKILLS.map(({ id, label }): MenuItem => ({
          type: 'item',
          label,
          icon: AGENT_COMMANDS.find((command) => command.id === id)?.icon,
          onSelect: () => {
            setCardSkill(taskKey, id);
            launchWithSkill(id);
          },
        })),
      );
    },
    [sessionId, item, skillId, launchWithSkill, dialogs, setCardSkill, taskKey],
  );

  return { onPlay };
}
