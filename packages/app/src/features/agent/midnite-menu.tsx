import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { LuRepeat } from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { startAgent } from '../terminal/start-agent';
import { useAgents } from '../terminal/use-agents';
import { AGENT_COMMANDS } from './agent-commands';

/**
 * The midnite menu — this app's own agent verbs, behind the app's own mark.
 *
 * First of the repository row's three menus, ahead of the Git logo and the
 * lifecycle ellipsis, and the ordering is the point: these are the things you
 * ask *midnite* to do with the repository, the git menu is what you ask *git*,
 * and the ellipsis is the repo's own tooling. Three menus with three different
 * marks, rather than three ellipses that all say "more".
 *
 * Every entry opens a fresh session with the **configured primary agent** (any
 * roster entry from Settings ▸ Agent — Claude by default) in the checkout and
 * types its skill at the prompt WITHOUT a newline — `startAgent`'s posture,
 * shared with the Agent settings page's uninstall command and the test
 * runner. Pressing Return is the confirmation, so a mis-clicked menu cannot
 * set an agent loose on a repository. It also means the queued command is
 * readable before it runs, which matters here more than anywhere else: what
 * each entry invokes is a setting, so the terminal is where you find out
 * whether it is still what you configured.
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

  const items: MenuItem[] = [];
  const loopSubmenuItems: MenuItem[] = [];
  let lastCategory: string | undefined;

  for (const { id, label, icon, category } of AGENT_COMMANDS) {
    /*
      `?? DEFAULT` against the types, not with them: the store's `merge` refills
      a missing entry and a test holds it to that, but this store is
      localStorage-backed and localStorage is editable. The type says `string`;
      a hand-mangled blob can still hand over `undefined`, and `.trim()` on it
      would take the whole sidebar down rather than one menu row.
    */
    const skill = (skills[id] ?? DEFAULT_AGENT_SKILLS[id]).trim();
    const menuItem: MenuItem = {
      label,
      icon,
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

    if (category === 'loops') {
      loopSubmenuItems.push(menuItem);
    } else {
      // A category change draws one divider — never before the first entry, and
      // never doubled when a category is a single row (release-prep is not).
      if (lastCategory !== undefined && category !== lastCategory) {
        items.push({ type: 'separator' });
      }
      lastCategory = category;
      items.push(menuItem);
    }
  }

  if (loopSubmenuItems.length > 0) {
    if (lastCategory !== undefined) {
      items.push({ type: 'separator' });
    }
    items.push({
      label: 'Loops',
      icon: LuRepeat,
      submenu: loopSubmenuItems,
    });
  }

  return (
    <IconButton
      icon={MidniteIcon}
      label={`Run a midnite skill on ${repoName}`}
      size="sm"
      tone="brand"
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
