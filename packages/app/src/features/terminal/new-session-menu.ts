import type { AgentDefinition, AgentStatus } from '@midnite/git-shared';
import { Terminal } from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { resolveAgentIcon } from '../../components/icons';

/**
 * The `+` menu's items, as data.
 *
 * Pure and separate from `terminal-panel.tsx` because the interesting part of
 * this menu is not how it is drawn, it is *which rows are dead and why*: four
 * agents, one of them uninstalled, and a whole menu disabled for a completely
 * different reason when there is no worktree selected. That is a table of
 * cases, and a table of cases wants a unit test rather than a render.
 */

/**
 * Why an item might be dead.
 *
 * Two reasons, and the worktree one wins: with no worktree there is nowhere to
 * open a session at all, so telling the user how to install OpenClaude would be
 * answering a question they have not reached yet.
 */
const NO_WORKTREE = 'No worktree selected';

export type NewSessionMenuInput = {
  agents: AgentDefinition[];
  /**
   * What the install probe found, keyed by agent id. **May be shorter than
   * `agents`** — an agent the probe could not answer for is absent, and absent
   * means "assume it works". A probe that failed must never be the reason a
   * working agent is greyed out.
   */
  status: AgentStatus[];
  /** Whether a worktree is selected; without one there is nowhere to open. */
  hasWorktree: boolean;
  onNewTerminal: () => void;
  onNewAgent: (agent: AgentDefinition) => void;
};

/**
 * **New Terminal**, a separator, then one row per agent — flat and iconned.
 *
 * The old labels read `New Agent — Claude`, a template that only works while
 * there is one agent to disambiguate from a heading. With four named agents the
 * label *is* the disambiguation, so the prefix goes and the mark carries the
 * identity.
 */
export function buildNewSessionMenu({
  agents,
  status,
  hasWorktree,
  onNewTerminal,
  onNewAgent,
}: NewSessionMenuInput): MenuItem[] {
  const byId = new Map(status.map((s) => [s.id, s]));

  const items: MenuItem[] = [
    {
      label: 'New Terminal',
      // lucide's Terminal, so the icon gutter is never ragged — a menu is
      // either iconless or fully iconed (see `ContextMenu`), and one plain row
      // among four marked ones reads as that row being singled out.
      icon: Terminal,
      onSelect: onNewTerminal,
      ...(hasWorktree ? {} : { disabled: true, disabledReason: NO_WORKTREE }),
    },
  ];
  if (agents.length === 0) return items;

  items.push({ type: 'separator' });

  for (const agent of agents) {
    // Absent status = unknown = assume installed. Only a probe that ran and
    // answered may disable a row.
    const missing = byId.get(agent.id)?.installed === false;
    const dead = !hasWorktree || missing;

    items.push({
      label: agent.label,
      icon: resolveAgentIcon(agent),
      /*
        Accent only while the row is live. A greyed-out item painted in a full
        brand colour reads as available-but-selected rather than unavailable,
        and the 40% opacity a disabled row already carries is not enough to
        undo a saturated orange.
      */
      ...(dead ? {} : { iconStyle: { color: agent.accent } }),
      onSelect: () => onNewAgent(agent),
      ...(dead
        ? {
            disabled: true,
            // The worktree reason wins: it is the one blocking every row, and
            // an install hint answers a question the user has not reached.
            disabledReason: hasWorktree ? installReason(agent) : NO_WORKTREE,
          }
        : {}),
    });
  }

  return items;
}

/**
 * What a missing agent's row says instead of nothing.
 *
 * The roster's own hint when it has one — that is what `install` is for. An
 * entry without one (a user-added agent, typically) still gets a sentence,
 * because a greyed row with an empty tooltip is the most frustrating thing a
 * menu can show.
 */
function installReason(agent: AgentDefinition): string {
  return agent.install ?? `\`${agent.command}\` was not found on your PATH`;
}
