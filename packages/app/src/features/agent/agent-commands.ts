import type { IconType } from 'react-icons';
import {
  LuFilePen,
  LuLightbulb,
  LuMessageSquareReply,
  LuPackageCheck,
  LuPlay,
  LuRepeat,
  LuRepeat2,
  LuRocket,
  LuScanEye,
} from 'react-icons/lu';

import type { AgentCommandId } from '../../store/ui-store';

/**
 * The midnite menu's category, in render order — the same order the menu draws
 * a separator on a change and the settings page draws a divider. "agent" and
 * "release" get no header, since each is a single obvious group; "loops" gets
 * the label because it is the one category the menu builds by wrapping other
 * entries rather than pointing at a skill of its own.
 */
export type AgentCommandCategory = 'agent' | 'release' | 'loops';

/**
 * The midnite menu's entries — what they are called, what glyph they take,
 * which category they fall in, and what the settings field for each should say.
 *
 * The ids and their default skills live on `ui-store` instead, and the split is
 * the one `SETTINGS_PAGES` / `PAGE_ICON` already draws: the store stays a plain
 * data module, so nothing that merely reads a persisted preference pulls an icon
 * package in behind it.
 *
 * Labels are a display layer over the ids, and deliberately not the ids
 * themselves — "Execute Task" reads as a verb phrase in a menu where the id
 * `exec` reads as jargon. Rewording one costs nothing, because the persisted
 * key is the id and nothing anywhere keys off the label.
 *
 * Order is render order, in both places that render it — the menu and the Agent
 * settings page — so the two cannot disagree about which verb comes first, or
 * about where a category boundary falls.
 */
export type AgentCommand = {
  id: AgentCommandId;
  label: string;
  icon: IconType;
  category: AgentCommandCategory;
  /** One line under the settings field, saying what the entry is for. */
  hint: string;
};

export const AGENT_COMMANDS: readonly AgentCommand[] = [
  {
    id: 'exec',
    label: 'Execute Task',
    icon: LuPlay,
    category: 'agent',
    hint: 'Pick up the next unblocked task and build it.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: LuLightbulb,
    category: 'agent',
    hint: 'Riff on a new phase and write the doc for it.',
  },
  {
    id: 'refine',
    label: 'Refine Plan',
    icon: LuFilePen,
    category: 'agent',
    hint: 'Deepen an existing phase doc until any model could execute it.',
  },
  {
    id: 'releasePrep',
    label: 'Release Prep',
    icon: LuRocket,
    category: 'release',
    hint: 'Draft the next release/vX.Y.Z branch and stop before anything irreversible.',
  },
  {
    id: 'releaseComplete',
    label: 'Release Complete',
    icon: LuPackageCheck,
    category: 'release',
    hint: 'Tag, push and cut the GitHub Release from a prepped release branch.',
  },
  {
    id: 'loopPrReview',
    label: 'Loop PR Review',
    icon: LuScanEye,
    category: 'loops',
    hint: 'Review the ready pull requests, on a loop.',
  },
  {
    id: 'loopPrFeedback',
    label: 'Loop PR Feedback',
    icon: LuMessageSquareReply,
    category: 'loops',
    hint: 'Address review feedback on your own pull requests, on a loop.',
  },
  {
    id: 'loopExec',
    label: 'Loop: Execute Task',
    icon: LuRepeat,
    category: 'loops',
    hint: 'Pick up and build the next unblocked task, on a loop.',
  },
  {
    id: 'loopBrainstorm',
    label: 'Loop: Brainstorm',
    icon: LuRepeat2,
    category: 'loops',
    hint: 'Riff on a new phase and write the doc for it, on a loop.',
  },
];
