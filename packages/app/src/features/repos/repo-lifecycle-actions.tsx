import { useState } from 'react';
import {
  LuEllipsisVertical,
  LuFlaskConical,
  LuFolder,
  LuFolderInput,
  LuFolderPlus,
  LuHammer,
  LuPackage,
  LuRocket,
} from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { useProjectActions } from '../agent/project-actions';
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
 * The title bar's per-selected-checkout cluster, where these four stand as
 * four buttons; the sidebar's per-repository header takes the same four verbs
 * collapsed behind {@link RepoLifecycleMenu}. Both call the same
 * `runLifecycleAction`, so a repo open in both places cannot disagree about
 * what "Build" means for it — and the same holds for the Setup/Update pair
 * that sits ahead of this cluster up there (`ProjectActions`) and heads that
 * menu.
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
 * The repository's own tooling, collapsed behind one ellipsis: Setup and
 * Update, then Install / Build / Test / Launch.
 *
 * Same four verbs and the same `runLifecycleAction` as {@link RepoLifecycleActions}, but for
 * the sidebar's repository row specifically: four standing icon buttons there, next to the
 * git sync control and the repo's own actions menu, read as more controls than one row has
 * room to carry. Collapsing them behind one ellipsis — this repo's tooling, as distinct from
 * the Git-logo menu's git and housekeeping actions — keeps the row scannable without dropping
 * any verb, and each verb keeps its glyph inside the menu.
 *
 * Setup and Update head that list because this menu is where they belong:
 * they act on the repository itself, not on an agent working in it, which is
 * the one thing every row of the midnite menu they came from has in common.
 * They sit above Install rather than below Launch because they are the rarer,
 * heavier pair — set the checkout up, or replace the installed app — and a
 * divider keeps them from reading as two more lifecycle verbs.
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
  const { actions: projectActions, dialog: setupDialog } = useProjectActions({
    repoId,
    repoName,
    cwd,
    ...(worktreePath ? { worktreePath } : {}),
  });
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
    /*
      Undescribed rows, though the midnite menu these two came from printed a
      line of sub-text under each: `ContextMenu`'s own rule is that a caller
      describes every entry of a menu or none of them, and the four lifecycle
      verbs beside them here explain themselves in a word. What that sub-text
      said survives in `buttonLabel`, which is the title bar pair's tooltip.
    */
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
  ];

  return (
    <>
      <IconButton
        icon={LuEllipsisVertical}
        label={`Set up, install, build, test or launch ${repoName}`}
        size="sm"
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
