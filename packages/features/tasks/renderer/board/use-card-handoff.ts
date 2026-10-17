import { agentRunFor, type ForgeProjectItem } from '@midnite/studio-shared';

import { useTasksHost, type TasksCardHandoff } from '../host';
import { useTasksUi } from '../ui';
import { defaultCardSkill } from './card-skill';

/**
 * A card's hand-off button, for an app with no terminal (Phase 113 Theme O): the run it would send —
 * the card's URL and the skill its picker shows, exactly what Studio's own Play types — and whether
 * the button may be pressed. `null` when the app hands nothing off, so the card draws no button.
 *
 * The run is built here and validated by `agentRunFor`: a draft card (no URL) or a skill that is not a
 * plain `/command` gives no run, and the button stays disabled with a reason. The app's gate (Coder's
 * Review actions switch) can close it too.
 */
export type CardHandoffButton = {
  disabled: boolean;
  title: string;
  onClick: (event: { stopPropagation: () => void }) => void;
};

const NO_GATE = () => ({ open: false, reason: '' });

export function useCardHandoff(item: ForgeProjectItem, taskKey: string): CardHandoffButton | null {
  const { cardHandoff, terminal } = useTasksHost();
  const handoff: TasksCardHandoff | undefined = terminal ? undefined : cardHandoff;
  const gate = (handoff?.useGate ?? NO_GATE)();
  const skill = useTasksUi((s) => defaultCardSkill({ item, taskKey, cardSkillByTask: s.cardSkillByTask, agentSkills: s.agentSkills }));
  if (!handoff) return null;

  const run = agentRunFor(item.content.type === 'draft' ? null : item.content.url, skill);
  const title =
    run === null
      ? item.content.type === 'draft'
        ? 'A draft has no issue to hand to an agent'
        : 'Only a plain /skill can be handed to an agent'
      : gate.open
        ? `Run ${run.skill} in an agent`
        : gate.reason;
  return {
    disabled: run === null || !gate.open,
    title,
    onClick: (event) => {
      event.stopPropagation();
      if (run !== null && gate.open) handoff.send(run);
    },
  };
}
