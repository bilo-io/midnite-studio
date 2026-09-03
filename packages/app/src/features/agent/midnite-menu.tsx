import { BUILTIN_AGENTS } from '@midnite/studio-shared';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { startAgent } from '../terminal/start-agent';
import { useAgents } from '../terminal/use-agents';
import { AGENT_COMMANDS, AGENT_COMMAND_GROUPS } from './agent-commands';

/**
 * The midnite menu — this app's own agent verbs, behind the app's own mark.
 *
 * First of the repository row's three menus, ahead of the Git logo and the
 * lifecycle ellipsis, and the ordering is the point: these are the things you
 * ask *midnite* to do with the repository, the git menu is what you ask *git*,
 * and the ellipsis is the repo's own tooling. Three menus with three different
 * marks, rather than three ellipses that all say "more".
 *
 * Its top level is the five groups of `AGENT_COMMAND_GROUPS` and nothing else —
 * Tasks, Reviews, Releases, Git, Loops — each opening a submenu of its verbs.
 * The flat list this replaced ran eleven rows deep before reaching its one
 * submenu, so "Loops" sat among the verbs looking like a twelfth of them
 * instead of the peer of the four groups the dividers were already implying.
 * Every row, at both levels, carries one line of sub-text: the group's says
 * what the group is for, the entry's is the same string the Agent settings
 * page prints under that entry's skill field.
 *
 * A sixth group, "Project", briefly held Setup and Update (Phase 49) and no
 * longer does: every row here hands a *skill* to an agent, and those two hand
 * over nothing of the kind. They moved to the lifecycle ellipsis and the title
 * bar's cluster, where the repo's own tooling already lives — see
 * `project-actions.tsx`.
 *
 * Every entry opens a fresh session with the **configured primary agent** (any
 * roster entry from Settings ▸ Agent — Claude by default) in the checkout and
 * types its skill at the prompt WITHOUT a newline — `startAgent`'s posture,
 * shared with the Agent settings page's uninstall command and the test runner.
 * Pressing Return is the confirmation, so a mis-clicked menu cannot set an
 * agent loose on a repository. It also means the queued command is readable
 * before it runs, which matters here more than anywhere else: what each entry
 * invokes is a setting, so the terminal is where you find out whether it is
 * still what you configured.
 */
export function MidniteMenu({
  repoId,
  repoName,
  cwd,
}: {
  repoId: string;
  repoName: string;
  cwd: string;
}) {
  const dialogs = useDialogs();
  const skills = useUiStore((s) => s.agentSkills);
  const primaryAgentId = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  // A stale persisted id (an agent removed from `agents.json`) falls back to
  // Claude, then to the first builtin — never to "no agent at all".
  const agent =
    agents.find((a) => a.id === primaryAgentId) ??
    agents.find((a) => a.id === 'claude') ??
    // BUILTIN_AGENTS is a non-empty literal tuple, so this index always exists.
    (BUILTIN_AGENTS[0] as (typeof BUILTIN_AGENTS)[number]);

  const toMenuItem = ({ id, label, icon, hint }: (typeof AGENT_COMMANDS)[number]): MenuItem => {
    /*
      `?? DEFAULT` against the types, not with them: the store's `merge` refills
      a missing entry and a test holds it to that, but this store is
      localStorage-backed and localStorage is editable. The type says `string`;
      a hand-mangled blob can still hand over `undefined`, and `.trim()` on it
      would take the whole sidebar down rather than one menu row.
    */
    const skill = (skills[id] ?? DEFAULT_AGENT_SKILLS[id]).trim();
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
        startAgent({ repoId, cwd, title: label, prompt: skill, agentId: agent.id, command: agent.command }),
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
