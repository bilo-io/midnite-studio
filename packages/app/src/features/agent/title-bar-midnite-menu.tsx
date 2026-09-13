import type { RepoDescriptor } from '@midnite/studio-shared';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import type { MenuItem } from '../../components/context-menu';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { AGENT_COMMAND_GROUPS, AGENT_COMMANDS } from './agent-commands';
import { useSkillHandoff } from './use-skill-handoff';
import { useProjectActions } from './project-actions';
import { runLifecycleAction, type LifecycleAction } from '../repos/repo-lifecycle';
import { LuPackage, LuHammer, LuFlaskConical, LuRocket } from 'react-icons/lu';

const ACTIONS: { action: LifecycleAction; icon: typeof LuPackage; label: string }[] = [
  { action: 'install', icon: LuPackage, label: 'Install' },
  { action: 'build', icon: LuHammer, label: 'Build' },
  { action: 'test', icon: LuFlaskConical, label: 'Test' },
  { action: 'launch', icon: LuRocket, label: 'Launch' },
];

export function TitleBarMidniteMenu({
  repo,
  repoId,
  repoName,
  cwd,
  worktreePath,
}: {
  repo?: RepoDescriptor;
  repoId: string;
  repoName: string;
  cwd: string;
  worktreePath?: string;
}) {
  const dialogs = useDialogs();
  const skills = useUiStore((s) => s.agentSkills);
  const handoff = useSkillHandoff();

  const { actions: projectActions, dialog: setupDialog } = useProjectActions({
    repoId,
    repoName,
    cwd,
    ...(worktreePath ? { worktreePath } : {}),
  });

  const run = (action: LifecycleAction) => {
    void runLifecycleAction(action, {
      repoId,
      repoName,
      cwd,
      ...(worktreePath ? { worktreePath } : {}),
    });
  };

  const toMenuItem = ({ id, label, icon, hint }: (typeof AGENT_COMMANDS)[number]): MenuItem => {
    const skill = (skills[id] ?? DEFAULT_AGENT_SKILLS[id] ?? '').trim();
    return {
      label,
      icon,
      description: hint,
      ...(skill === ''
        ? { disabled: true, disabledReason: 'no skill set in Settings → Agent' }
        : {}),
      onSelect: () => handoff({ skillId: id, repo, repoId, cwd, title: label }),
    };
  };

  const skillItems: MenuItem[] = AGENT_COMMAND_GROUPS.flatMap((group) => {
    const submenu = AGENT_COMMANDS.filter((command) => command.category === group.id).map(toMenuItem);
    if (submenu.length === 0) return [];
    return [{ label: group.label, icon: group.icon, description: group.hint, submenu }];
  });

  const items: MenuItem[] = [
    ...projectActions.map((action) => ({
      label: action.label,
      icon: action.icon,
      ...(action.disabled ? { disabled: true } : {}),
      ...(action.disabledReason ? { disabledReason: action.disabledReason } : {}),
      onSelect: action.onSelect,
    })),
    { type: 'separator' },
    ...ACTIONS.map(({ action, icon, label }) => ({
      label,
      icon,
      onSelect: () => run(action),
    })),
    { type: 'separator' },
    ...skillItems,
  ];

  return (
    <>
      <IconButton
        icon={MidniteIcon}
        label={`Midnite actions for ${repoName}`}
        size="sm"
        data-testid="titlebar-midnite-menu"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          dialogs.openMenu(
            { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
            items,
          );
        }}
      />
      {setupDialog}
    </>
  );
}
