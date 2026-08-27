import type { IconType } from 'react-icons';
import { LuLightbulb, LuMessageSquareReply, LuPlay, LuScanEye } from 'react-icons/lu';

import type { AgentCommandId } from '../../store/ui-store';

/**
 * The midnite menu's four entries — what they are called, what glyph they take,
 * and what the settings field for each should say.
 *
 * The ids and their default skills live on `ui-store` instead, and the split is
 * the one `SETTINGS_PAGES` / `PAGE_ICON` already draws: the store stays a plain
 * data module, so nothing that merely reads a persisted preference pulls an icon
 * package in behind it.
 *
 * Order is render order, in both places that render it — the menu and the Agent
 * settings page — so the two cannot disagree about which verb comes first.
 */
export type AgentCommand = {
  id: AgentCommandId;
  label: string;
  icon: IconType;
  /** One line under the settings field, saying what the entry is for. */
  hint: string;
};

export const AGENT_COMMANDS: readonly AgentCommand[] = [
  {
    id: 'exec',
    label: 'Exec',
    icon: LuPlay,
    hint: 'Pick up the next unblocked task and build it.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: LuLightbulb,
    hint: 'Riff on a new phase and write the doc for it.',
  },
  {
    id: 'loopPrReview',
    label: 'Loop PR Review',
    icon: LuScanEye,
    hint: 'Review the ready pull requests, on a loop.',
  },
  {
    id: 'loopPrFeedback',
    label: 'Loop PR Feedback',
    icon: LuMessageSquareReply,
    hint: 'Address review feedback on your own pull requests, on a loop.',
  },
];
