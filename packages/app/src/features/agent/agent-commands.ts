import type { IconType } from 'react-icons';
import {
  LuBug,
  LuChartLine,
  LuClipboardCheck,
  LuFilePen,
  LuGitBranch,
  LuGitPullRequest,
  LuInfinity,
  LuLightbulb,
  LuListChecks,
  LuListTodo,
  LuMessageSquare,
  LuMessageSquareReply,
  LuPackage,
  LuPackageCheck,
  LuPlay,
  LuRadar,
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
 * The midnite menu's five groups, in render order.
 *
 * Every entry lives in exactly one of them and the menu shows nothing else at
 * its top level: five submenu rows, no loose verbs beside them. The flat list
 * this replaced put eleven rows and one submenu on the same plane, which made
 * "Loops" read as a twelfth verb rather than as the other four groups' mirror.
 *
 * `hint` is the sub-text under the label — one line, in every place the group
 * is drawn.
 */
export type AgentCommandCategory = 'tasks' | 'reviews' | 'releases' | 'git' | 'loops';

export type AgentCommandGroup = {
  id: AgentCommandCategory;
  label: string;
  icon: IconType;
  /** One line under the group's label, saying what the group is for. */
  hint: string;
};

export const AGENT_COMMAND_GROUPS: readonly AgentCommandGroup[] = [
  {
    id: 'tasks',
    label: 'Tasks',
    icon: LuListChecks,
    hint: 'Plan and build work in this repository.',
  },
  {
    id: 'reviews',
    label: 'Reviews',
    icon: LuClipboardCheck,
    hint: 'Review pull requests, and answer the ones you own.',
  },
  {
    id: 'releases',
    label: 'Releases',
    icon: LuPackage,
    hint: 'Prepare and ship a version.',
  },
  {
    id: 'git',
    label: 'Git',
    icon: LuGitBranch,
    hint: 'Report on and tidy up branches and worktrees.',
  },
  {
    id: 'loops',
    label: 'Loops',
    icon: LuInfinity,
    hint: 'The same verbs, repeating until you stop them.',
  },
];

/**
 * The midnite menu's entries — what they are called, what glyph they take,
 * which group they fall in, and the one line of sub-text each carries.
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
 * `hint` is one string serving two renderers — the menu row's description and
 * the settings field's caption — rather than two that drift. It is written
 * short enough for a menu and complete enough for a form.
 *
 * Order is render order, in both places that render it — the menu and the Agent
 * settings page — so the two cannot disagree about which verb comes first, or
 * about where a group boundary falls.
 */
export type AgentCommand = {
  id: AgentCommandId;
  label: string;
  icon: IconType;
  category: AgentCommandCategory;
  /** One line under the entry, saying what it is for. */
  hint: string;
};

export const AGENT_COMMANDS: readonly AgentCommand[] = [
  {
    id: 'execBacklog',
    label: 'Backlog Task',
    icon: LuPlay,
    category: 'tasks',
    hint: 'Pick up the next unblocked backlog task and build it.',
  },
  {
    id: 'execAdhoc',
    label: 'Adhoc Task',
    icon: LuZap,
    category: 'tasks',
    hint: 'Build a one-off task described up front.',
  },
  {
    id: 'addressIssue',
    label: 'Address Issue',
    icon: LuBug,
    category: 'tasks',
    hint: 'Triage the issue board and fix the top one.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: LuLightbulb,
    category: 'tasks',
    hint: 'Riff on a new phase and write the doc for it.',
  },
  {
    id: 'refine',
    label: 'Refine Plan',
    icon: LuFilePen,
    category: 'tasks',
    hint: 'Deepen an existing phase doc until any model could execute it.',
  },
  {
    id: 'prReview',
    label: 'PR Review',
    icon: LuScanEye,
    category: 'reviews',
    hint: 'Review the pull requests waiting on you.',
  },
  {
    id: 'prFeedback',
    label: 'PR Feedback',
    icon: LuMessageSquareReply,
    category: 'reviews',
    hint: 'Address review feedback on your own pull requests.',
  },
  {
    id: 'releasePrep',
    label: 'Release Prep',
    icon: LuRocket,
    category: 'releases',
    hint: 'Draft the next release branch, stopping before the tag.',
  },
  {
    id: 'releaseComplete',
    label: 'Release Complete',
    icon: LuPackageCheck,
    category: 'releases',
    hint: 'Tag, push and cut the GitHub Release from a prepped branch.',
  },
  {
    id: 'gitReport',
    label: 'Git Report',
    icon: LuChartLine,
    category: 'git',
    hint: 'Report merged PRs and phase progress over a day, week or month.',
  },
  {
    id: 'gitCleanup',
    label: 'Git Cleanup',
    icon: LuScissors,
    category: 'git',
    hint: 'Prune branches and worktrees that have fully landed. Dry-run first.',
  },
  {
    id: 'loopPatrol',
    label: 'Loop: Patrol',
    icon: LuRadar,
    category: 'loops',
    hint: "The FAB's Patrol tab — its checkboxes append the PR skills to this line.",
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
    hint: 'Pick up and build the next unblocked backlog task, on a loop.',
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
