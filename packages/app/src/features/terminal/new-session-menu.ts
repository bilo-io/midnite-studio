import type { CSSProperties } from 'react';

import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

import type { IconComponent } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';

/**
 * The `+` menu's rows, as data.
 *
 * Pure and separate from `new-session-picker.tsx` because the interesting part
 * of this menu is not how it is drawn, it is *which rows are dead and why*:
 * a dozen agents, some uninstalled, and a whole menu disabled for a completely
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
export const NO_WORKTREE = 'No worktree selected';

/**
 * The catalog's proprietary/open-source split, for the menu's two sections —
 * not a property of `AgentDefinition` itself, since `packages/shared` stays
 * data-only and this is a presentation grouping, not part of the wire
 * contract. Membership here is what makes an entry read as "proprietary"; a
 * roster id absent from this set lands in Open Source by construction, which
 * is what a new agent like Goose gets by simply not being added to it.
 */
export const PROPRIETARY_IDS = new Set(['claude', 'agy', 'codex', 'cursor', 'copilot', 'grok']);

export type AgentRow = {
  agent: AgentDefinition;
  icon: IconComponent;
  /**
   * Accent only while the row is live — see `installReason`'s neighbour
   * below. A greyed-out item painted in a full brand colour reads as
   * available-but-selected rather than unavailable, and the 40% opacity a
   * disabled row already carries is not enough to undo a saturated orange.
   */
  iconStyle: CSSProperties | undefined;
  disabled: boolean;
  /** The worktree reason wins when both apply — see `NO_WORKTREE`. */
  disabledReason: string | undefined;
};

export type AgentSection = {
  id: 'proprietary' | 'open-source';
  label: string;
  rows: AgentRow[];
};

export type BuildAgentSectionsInput = {
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
};

/**
 * The roster, split into the menu's two sections and annotated with why each
 * row would be dead — everything the picker needs to render without touching
 * `AgentStatus`, `PROPRIETARY_IDS` or the install-hint fallback itself.
 *
 * A section absent from the roster (nothing proprietary installed, say)
 * is omitted rather than returned empty, which is what lets the picker hide a
 * section's header without a second "is this section empty" check of its own.
 */
export function buildAgentSections({
  agents,
  status,
  hasWorktree,
}: BuildAgentSectionsInput): AgentSection[] {
  const byId = new Map(status.map((s) => [s.id, s]));

  const toRow = (agent: AgentDefinition): AgentRow => {
    // Absent status = unknown = assume installed. Only a probe that ran and
    // answered may disable a row.
    const missing = byId.get(agent.id)?.installed === false;
    const dead = !hasWorktree || missing;

    return {
      agent,
      icon: resolveAgentIcon(agent),
      iconStyle: dead ? undefined : { color: agent.accent },
      disabled: dead,
      // The worktree reason wins: it is the one blocking every row, and an
      // install hint answers a question the user has not reached.
      disabledReason: dead ? (hasWorktree ? installReason(agent) : NO_WORKTREE) : undefined,
    };
  };

  const proprietary = agents.filter((a) => PROPRIETARY_IDS.has(a.id)).map(toRow);
  const openSource = agents.filter((a) => !PROPRIETARY_IDS.has(a.id)).map(toRow);

  const sections: AgentSection[] = [];
  if (proprietary.length > 0) {
    sections.push({ id: 'proprietary', label: 'Proprietary', rows: proprietary });
  }
  if (openSource.length > 0) {
    sections.push({ id: 'open-source', label: 'Open Source', rows: openSource });
  }
  return sections;
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
