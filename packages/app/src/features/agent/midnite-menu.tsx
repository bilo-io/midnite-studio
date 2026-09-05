import type { RepoDescriptor } from '@midnite/studio-shared';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import type { MenuItem } from '../../components/context-menu';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { AGENT_COMMAND_GROUPS, AGENT_COMMANDS } from './agent-commands';
import { useSkillHandoff } from './use-skill-handoff';

/**
 * The sidebar's `M` mark beside a repository row.
 *
 * Opens a cascading context menu of the midnite workflow verbs — brainstorm,
 * refine, adhoc task, backlog task, review, report, release — and seeds the
 * primary agent's command line in a terminal cwd'd to that repository.
 *
 * **Types, does not run**: seeds the command line with no trailing return, so
 * the human sees what is about to execute and decides when to press Return.
 * See `startAgent` for the posture this inherits.
 *
 * **Organised by intent**, not by CLI: `AGENT_COMMAND_GROUPS` clusters the
 * verbs into tasks, reviews, repo lifecycle and loops, each behind its own
 * chevron, so an eighteen-verb menu stays human-scannable.
 *
 * Re-reads the configured skill strings from `useUiStore.agentSkills` so a
 * user override in Settings ▸ Agent takes effect immediately, with no restart.
 */
export function MidniteMenu({
  repo,
  repoId,
  repoName,
  cwd,
}: {
  repo?: RepoDescriptor;
  repoId: string;
  repoName: string;
  cwd: string;
}) {
  const dialogs = useDialogs();
  const skills = useUiStore((s) => s.agentSkills);
  const handoff = useSkillHandoff();

  const toMenuItem = ({ id, label, icon, hint }: (typeof AGENT_COMMANDS)[number]): MenuItem => {
    /*
      `?? DEFAULT` against the types, not with them: the store's `merge` refills
      a missing entry and a test holds it to that, but this store is
      localStorage-backed and localStorage is editable. The type says `string`;
      a hand-mangled blob can still hand over `undefined`, and `.trim()` on it
      would take the whole sidebar down rather than one menu row.
    */
    const skill = (skills[id] ?? DEFAULT_AGENT_SKILLS[id] ?? '').trim();
    return {
      label,
      icon,
      description: hint,
      // A cleared field is a real state — the setting takes any prompt, so it
      // also takes none — and an empty one would open a terminal on the bare
      // agent command with nothing typed. Naming the page that fixes it beats
      // a dead click.
      ...(skill === ''
        ? { disabled: true, disabledReason: 'no skill set in Settings → Agent' }
        : {}),
      onSelect: () =>
        handoff({ skillId: id, repo, repoId, cwd, title: label }),
    };
  };

  /*
    A group with no entries is dropped rather than drawn empty: `AGENT_COMMANDS`
    and `AGENT_COMMAND_GROUPS` are two literals that a later edit could put out
    of step, and an empty submenu is a dead-end row with a chevron on it.
  */
  const items: MenuItem[] = AGENT_COMMAND_GROUPS.flatMap((group) => {
    const submenu = AGENT_COMMANDS.filter((command) => command.category === group.id).map(
      toMenuItem,
    );
    if (submenu.length === 0) return [];
    return [{ label: group.label, icon: group.icon, description: group.hint, submenu }];
  });

  return (
    <IconButton
      icon={MidniteIcon}
      label={`Run a midnite skill on ${repoName}`}
      size="sm"
      tone="brand"
      className="opacity-50 hover:opacity-100"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        // A keyboard activation reports 0,0 — fall back to the button's own box
        // so the menu opens under the control rather than in the corner.
        dialogs.openMenu(
          { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
          items,
        );
      }}
    />
  );
}
