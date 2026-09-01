import type { IconType } from 'react-icons';
import {
  LuBug,
  LuChartLine,
  LuFilePen,
  LuGitPullRequest,
  LuLightbulb,
  LuListTodo,
  LuMessageSquare,
  LuMessageSquareReply,
  LuPackageCheck,
  LuPlay,
  LuRepeat,
  LuRepeat2,
  LuRocket,
  LuRotateCw,
  LuScanEye,
  LuScissors,
  LuZap,
} from 'react-icons/lu';

import type { AgentCommandId } from '../../store/ui-store';

/**
 * The midnite menu's category, in render order — the same order the menu draws
 * a separator on a change and the settings page draws a divider.
 */
export type AgentCommandCategory = 'execute' | 'pr' | 'release' | 'maintain' | 'loops';

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
 * themselves. Rewording one costs nothing, because the persisted key is the id
 * and nothing anywhere keys off the label.
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
    id: 'execBacklog',
    label: 'Backlog Task',
    icon: LuPlay,
    category: 'execute',
    hint: 'Pick up the next unblocked task from the backlog and build it.',
  },
  {
    id: 'execAdhoc',
    label: 'Adhoc Task',
    icon: LuZap,
    category: 'execute',
    hint: 'Execute an adhoc task.',
  },
  {
    id: 'addressIssue',
    label: 'Address Issue',
    icon: LuBug,
    category: 'execute',
    hint: 'Address a specific issue or bug in the repository.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: LuLightbulb,
    category: 'execute',
    hint: 'Riff on a new phase and write the doc for it.',
  },
  {
    id: 'refine',
    label: 'Refine Plan',
    icon: LuFilePen,
    category: 'execute',
    hint: 'Deepen an existing phase doc until any model could execute it.',
  },
  {
    id: 'prReview',
    label: 'PR Review',
    icon: LuScanEye,
    category: 'pr',
    hint: 'Review ready pull requests.',
  },
  {
    id: 'prFeedback',
    label: 'PR Feedback',
    icon: LuMessageSquareReply,
    category: 'pr',
    hint: 'Address review feedback on your own pull requests.',
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
    id: 'gitReport',
    label: 'Git Report',
    icon: LuChartLine,
    category: 'maintain',
    hint: 'Report merged PRs and phase progress over a day, week or month.',
  },
  {
    id: 'gitCleanup',
    label: 'Git Cleanup',
    icon: LuScissors,
    category: 'maintain',
    hint: 'Prune branches and worktrees that have fully landed on main. Dry-run first.',
  },
  {
    id: 'loopPrReview',
    label: 'Loop: PR Review',
    icon: LuGitPullRequest,
    category: 'loops',
    hint: 'Review the ready pull requests, on a loop.',
  },
  {
    id: 'loopPrFeedback',
    label: 'Loop: PR Feedback',
    icon: LuMessageSquare,
    category: 'loops',
    hint: 'Address review feedback on your own pull requests, on a loop.',
  },
  {
    id: 'loopExecBacklog',
    label: 'Loop: Backlog Task',
    icon: LuRepeat,
    category: 'loops',
    hint: 'Pick up and build the next unblocked task from the backlog, on a loop.',
  },
  {
    id: 'loopExecAdhoc',
    label: 'Loop: Adhoc Task',
    icon: LuRepeat2,
    category: 'loops',
    hint: 'Execute adhoc tasks, on a loop.',
  },
  {
    id: 'loopAddressIssue',
    label: 'Loop: Address Issue',
    icon: LuRotateCw,
    category: 'loops',
    hint: 'Address issues, on a loop.',
  },
  {
    id: 'loopBrainstorm',
    label: 'Loop: Brainstorm',
    icon: LuListTodo,
    category: 'loops',
    hint: 'Riff on a new phase and write the doc for it, on a loop.',
  },
];
