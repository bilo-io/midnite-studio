import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { LuFlaskConical, LuFolder, LuFolderInput, LuFolderPlus, LuHammer, LuPackage, LuRocket } from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { runLifecycleAction, type LifecycleAction } from './repo-lifecycle';

const ACTIONS: { action: LifecycleAction; icon: typeof LuPackage; label: string }[] = [
  { action: 'install', icon: LuPackage, label: 'Install' },
  { action: 'build', icon: LuHammer, label: 'Build' },
  { action: 'test', icon: LuFlaskConical, label: 'Test' },
  { action: 'launch', icon: LuRocket, label: 'Launch' },
];

/**
 * Install / Build / Test / Launch, for one checkout.
 *
 * Shared between the sidebar's per-repository header and the title bar's
 * per-selected-checkout cluster — the two are the same four verbs aimed at
 * different targets (a repo's main worktree; whichever checkout is selected),
 * and a repo open in both places should not be able to disagree about what
 * "Build" means for it.
 *
 * Each click is fire-and-forget: `runLifecycleAction` opens a terminal with
 * its guessed command typed in, not run, so there is no result to await here
 * — only a brief per-button disable so a slow filesystem read cannot be
 * double-clicked into two terminals.
 */
export function RepoLifecycleActions({
  repoId,
  repoName,
  cwd,
  worktreePath,
}: {
  repoId: string;
  repoName: string;
  cwd: string;
  worktreePath?: string;
}) {
  const [pending, setPending] = useState<LifecycleAction | null>(null);

  const run = (action: LifecycleAction) => {
    setPending(action);
    void runLifecycleAction(action, {
      repoId,
      repoName,
      cwd,
      ...(worktreePath ? { worktreePath } : {}),
    }).finally(() => setPending((current) => (current === action ? null : current)));
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {ACTIONS.map(({ action, icon, label }) => (
        <IconButton
          key={action}
          icon={icon}
          label={`${label} ${repoName}`}
          size="sm"
          busy={pending === action}
          onClick={() => run(action)}
        />
      ))}
    </div>
  );
}

/**
 * Install / Build / Test / Launch, collapsed behind one ellipsis.
 *
 * Same four verbs and the same `runLifecycleAction` as {@link RepoLifecycleActions}, but for
 * the sidebar's repository row specifically: four standing icon buttons there, next to the
 * git sync control and the repo's own actions menu, read as more controls than one row has
 * room to carry. Collapsing them behind one ellipsis — this repo's tooling, as distinct from
 * the Git-logo menu's git and housekeeping actions — keeps the row scannable without dropping
 * any verb, and each verb keeps its glyph inside the menu.
 */
export function RepoLifecycleMenu({
  repoId,
  repoName,
  cwd,
  worktreePath,
}: {
  repoId: string;
  repoName: string;
  cwd: string;
  worktreePath?: string;
}) {
  const dialogs = useDialogs();
  const repoGroups = useUiStore((s) => s.repoGroups);
  const currentGroupId = useUiStore((s) => s.repoGroupMembership[repoId]);
  const createRepoGroup = useUiStore((s) => s.createRepoGroup);
  const assignRepoToGroup = useUiStore((s) => s.assignRepoToGroup);

  const run = (action: LifecycleAction) => {
    void runLifecycleAction(action, {
      repoId,
      repoName,
      cwd,
      ...(worktreePath ? { worktreePath } : {}),
    });
  };

  const promptNewGroup = () => {
    dialogs.prompt({
      title: 'New repo group',
      label: 'Group name',
      confirmLabel: 'Create',
      onConfirm: (name) => assignRepoToGroup(repoId, createRepoGroup(name)),
    });
  };

  const addToGroup: MenuItem = {
    label: 'Add to group',
    icon: LuFolderInput,
    submenu: [
      { label: '+ New group', icon: LuFolderPlus, onSelect: promptNewGroup },
      ...(repoGroups.length > 0
        ? [
            { type: 'separator' as const },
            ...repoGroups
              .filter((group) => group.id !== currentGroupId)
              .map((group) => ({
                label: group.name,
                icon: LuFolder,
                onSelect: () => assignRepoToGroup(repoId, group.id),
              })),
          ]
        : []),
    ],
  };

  /*
    The same four glyphs the standing-button variant uses. A menu of four bare
    verbs made the icons the ellipsis had replaced unrecoverable — carrying them
    into the rows keeps "Build" recognisable at a glance and keeps this menu and
    the title bar's cluster saying the same thing in the same marks.
  */
  const items: MenuItem[] = [
    addToGroup,
    { type: 'separator' },
    ...ACTIONS.map(({ action, icon, label }) => ({
      label,
      icon,
      onSelect: () => run(action),
    })),
  ];

  return (
    <IconButton
      icon={MoreVertical}
      label={`Install, build, test or launch ${repoName}`}
      size="sm"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        dialogs.openMenu(
          { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
          items,
        );
      }}
    />
  );
}
