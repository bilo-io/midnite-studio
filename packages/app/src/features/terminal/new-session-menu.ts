import type { CSSProperties } from 'react';

import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

import type { IconComponent } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';
import { agentInstallHint, isAgentUnconfigured } from '../agent/agent-install-status';

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
  /**
   * True only when there is nowhere to open a session at all (no worktree
   * selected) — a native-disabled, unclickable row. Kept apart from
   * `unconfigured` on purpose: a row that is merely uninstalled still has a
   * useful click (see below), so it must never end up behind a `disabled`
   * attribute a click handler can't reach.
   */
  disabled: boolean;
  /**
   * True when the agent itself is not installed/configured on this machine.
   * The row still renders greyed out, but stays a real, clickable button —
   * clicking (or Enter) routes to Settings ▸ Agents instead of starting a
   * session. Always `false` when `disabled` is true: with no worktree, the
   * worktree reason wins and there is nothing useful to click through to yet.
   */
  unconfigured: boolean;
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
  const toRow = (agent: AgentDefinition): AgentRow => {
    // The worktree reason wins: with nowhere to open a session, a row is
    // truly inert regardless of install status.
    const disabled = !hasWorktree;
    const unconfigured = hasWorktree && isAgentUnconfigured(agent, status);
    const dead = disabled || unconfigured;

    return {
      agent,
      icon: resolveAgentIcon(agent),
      iconStyle: dead ? undefined : { color: agent.accent },
      disabled,
      unconfigured,
      // The worktree reason wins: it is the one blocking every row, and an
      // install hint answers a question the user has not reached.
      disabledReason: dead ? (disabled ? NO_WORKTREE : agentInstallHint(agent)) : undefined,
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
