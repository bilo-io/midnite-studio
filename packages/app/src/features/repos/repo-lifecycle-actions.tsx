import { useState } from 'react';
import { LuFlaskConical, LuHammer, LuPackage, LuRocket } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
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
