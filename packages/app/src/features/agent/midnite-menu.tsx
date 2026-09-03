import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { LuDownload, LuWrench } from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { startAgent } from '../terminal/start-agent';
import { useTerminalStore } from '../terminal/terminal-store';
import { useAgents } from '../terminal/use-agents';
import { AGENT_COMMANDS, AGENT_COMMAND_GROUPS } from './agent-commands';
import { hasMidniteDir, isMidniteStudioCheckout } from './repo-capability';
import { SetupDialog } from './setup-dialog';

/**
 * The midnite menu — this app's own agent verbs, behind the app's own mark.
 *
 * First of the repository row's three menus, ahead of the Git logo and the
 * lifecycle ellipsis, and the ordering is the point: these are the things you
 * ask *midnite* to do with the repository, the git menu is what you ask *git*,
 * and the ellipsis is the repo's own tooling. Three menus with three different
 * marks, rather than three ellipses that all say "more".
 *
 * Its top level is the six groups of `AGENT_COMMAND_GROUPS` and nothing else —
 * Tasks, Reviews, Releases, Git, Loops, Project — each opening a submenu of
 * its verbs. The flat list this replaced ran eleven rows deep before reaching
 * its one submenu, so "Loops" sat among the verbs looking like a twelfth of
 * them instead of the peer of the four groups the dividers were already
 * implying. Every row, at both levels, carries one line of sub-text: the
 * group's says what the group is for, the entry's is the same string the
 * Agent settings page prints under that entry's skill field — except
 * Project's two leaves, which have no skill field; see `agent-commands.ts`'s
 * own comment on why they are not `AGENT_COMMANDS` entries.
 *
 * Every OTHER entry opens a fresh session with the **configured primary
 * agent** (any roster entry from Settings ▸ Agent — Claude by default) in the
 * checkout and types its skill at the prompt WITHOUT a newline —
 * `startAgent`'s posture, shared with the Agent settings page's uninstall
 * command and the test runner. Pressing Return is the confirmation, so a
 * mis-clicked menu cannot set an agent loose on a repository. It also means
 * the queued command is readable before it runs, which matters here more than
 * anywhere else: what each entry invokes is a setting, so the terminal is
 * where you find out whether it is still what you configured.
 *
 * **Project's two leaves are about the repository itself, not an agent
 * working in it (Phase 49), and neither fits that pattern.** Setup opens
 * `SetupDialog` — a preview, never a blind write. Update still `startAgent`s
 * a typed-not-run command like every other leaf, but the command is fixed
 * (`moon run desktop:install-local`) rather than a configurable skill, and
 * the leaf disables itself with a reason outside the one checkout it can
 * possibly work in.
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
  const [setupOpen, setSetupOpen] = useState(false);
  // Read once per repo, not on every menu open: both predicates are read-only
  // filesystem checks (Setup's own dialog re-reads the real plan when it
  // opens), and a menu click should not wait on two IPC round trips first.
  const [hasKit, setHasKit] = useState(false);
  const [isStudioCheckout, setIsStudioCheckout] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hasMidniteDir(repoId).then((value) => {
      if (!cancelled) setHasKit(value);
    });
    void isMidniteStudioCheckout(repoId).then((value) => {
      if (!cancelled) setIsStudioCheckout(value);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId]);
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
    Project's two leaves, built directly rather than through `toMenuItem` —
    see `agent-commands.ts`'s own comment on why they are not `AGENT_COMMANDS`
    entries at all.
  */
  const projectSubmenu: MenuItem[] = [
    {
      label: 'Set up this repo',
      icon: LuWrench,
      description: hasKit
        ? 'Update the onboarding kit — the tracker, skills and agent-file stubs.'
        : 'Copy in the onboarding kit — the tracker, skills and agent-file stubs.',
      onSelect: () => setSetupOpen(true),
    },
    {
      label: 'Update Midnite Studio',
      icon: LuDownload,
      description: 'Rebuild and install this checkout to /Applications.',
      ...(isStudioCheckout
        ? {}
        : { disabled: true, disabledReason: 'Only for the Midnite Studio checkout' }),
      // A plain shell, not `startAgent`: that function always wraps `prompt`
      // as an argument TO an agent CLI (`claude "…"`), which is exactly wrong
      // for a literal command that must run verbatim at a bare prompt.
      // `repo-lifecycle.ts`'s `runLifecycleAction` is the actual "type,
      // don't run" precedent the phase doc points at, and this mirrors it.
      onSelect: () => {
        useUiStore.getState().setTerminalOpen(true);
        const session = useTerminalStore.getState().openSession({
          kind: 'shell',
          title: repoName,
          name: 'Update',
          cwd,
          repoId,
        });
        useTerminalStore.getState().queueInput(session.id, 'moon run desktop:install-local');
      },
    },
  ];

  /*
    A group with no entries is dropped rather than drawn empty: `AGENT_COMMANDS`
    and `AGENT_COMMAND_GROUPS` are two literals that a later edit could put out
    of step, and an empty submenu is a dead-end row with a chevron on it.
  */
  const items: MenuItem[] = AGENT_COMMAND_GROUPS.flatMap((group) => {
    const submenu =
      group.id === 'project'
        ? projectSubmenu
        : AGENT_COMMANDS.filter((command) => command.category === group.id).map(toMenuItem);
    if (submenu.length === 0) return [];
    return [{ label: group.label, icon: group.icon, description: group.hint, submenu }];
  });

  return (
    <>
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
      {setupOpen
        ? createPortal(
            <SetupDialog
              repoId={repoId}
              repoName={repoName}
              hasExistingKit={hasKit}
              onClose={() => {
                setSetupOpen(false);
                // The dialog may have just written a `.midnite/`, or updated
                // an existing one — re-read so the wording is right the next
                // time this same leaf opens, without waiting for a repo
                // re-select.
                void hasMidniteDir(repoId).then(setHasKit);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
