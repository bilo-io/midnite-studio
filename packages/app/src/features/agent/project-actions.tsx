import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { LuDownload, LuWrench } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { hasMidniteDir, hasPackagedBuild, isMidniteStudioCheckout } from './repo-capability';
import { SetupDialog } from './setup-dialog';

/**
 * Setup and Update — the two actions about the repository *itself*, rather
 * than about an agent working in it.
 *
 * They began (Phase 49) as the midnite menu's sixth group, "Project", and
 * that was the wrong shelf: every other row of that menu hands a skill to an
 * agent, so two rows that do not made the menu's own premise read as
 * approximate. They belong with Install/Build/Test/Launch — the repo's own
 * tooling, which is what the lifecycle ellipsis already collects — so they
 * head that menu, above Install and behind a divider, and they stand as two
 * more buttons ahead of the four in the title bar's cluster.
 *
 * One hook feeds both surfaces, for the reason `RepoLifecycleActions` and
 * `RepoLifecycleMenu` already share `runLifecycleAction`: a repository open
 * in the sidebar and selected in the title bar must not be able to disagree
 * about whether Update is available to it.
 *
 * Neither action runs anything on click. Setup opens `SetupDialog` — a
 * preview, never a blind write. Update opens a plain shell with
 * `moon run desktop:install-local` TYPED at the prompt, not executed: the
 * same "your Return is the confirmation" posture `runLifecycleAction` and
 * `startAgent` take. A plain shell rather than `startAgent`, because that
 * function always wraps its prompt as an argument to an agent CLI
 * (`claude "…"`), which is exactly wrong for a literal command.
 */
export type ProjectAction = {
  key: 'setup' | 'update';
  /** The menu row's label. */
  label: string;
  /**
   * The standing button's accessible name and tooltip.
   *
   * A separate string rather than the row's label, because the two surfaces
   * ask different things of it: a menu row sits under a repo's own name and
   * can say "this repo", while a title-bar button is one glyph with nothing
   * around it and has to name the checkout itself. Setup's also carries the
   * "already set up?" distinction the menu row cannot — the row's label is
   * fixed, and a label that changed under the cursor would be worse than one
   * that says less.
   */
  buttonLabel: string;
  icon: IconComponent;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
};

export type ProjectActionsTarget = {
  repoId: string;
  repoName: string;
  cwd: string;
  worktreePath?: string;
};

/**
 * The two actions, plus the Setup dialog's own portal.
 *
 * The dialog comes back as a node rather than being rendered here because
 * both callers are a single control in a row — a menu's `IconButton`, or the
 * title bar's cluster — and a modal must not be laid out inside either. Each
 * caller drops `dialog` beside its own controls and React portals it to
 * `document.body` from there.
 */
export function useProjectActions(target: ProjectActionsTarget): {
  actions: ProjectAction[];
  dialog: ReactNode;
} {
  const { repoId, repoName, cwd, worktreePath } = target;
  const [setupOpen, setSetupOpen] = useState(false);
  // Read once per repo, not on every menu open: both predicates are read-only
  // filesystem checks (Setup's own dialog re-reads the real plan when it
  // opens), and a click should not wait on two IPC round trips first.
  const [hasKit, setHasKit] = useState(false);
  const [isStudioCheckout, setIsStudioCheckout] = useState(false);
  const [hasBuild, setHasBuild] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hasMidniteDir(repoId, worktreePath).then((value) => {
      if (!cancelled) setHasKit(value);
    });
    void isMidniteStudioCheckout(repoId, worktreePath).then((value) => {
      if (!cancelled) setIsStudioCheckout(value);
    });
    void hasPackagedBuild(repoId, worktreePath).then((value) => {
      if (!cancelled) setHasBuild(value);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId, worktreePath]);

  // A run of `install-local` is exactly what turns `hasBuild` from false to
  // true (it depends on `~:dist`), so the one-time read above goes stale the
  // moment Update's own session finishes — re-read when that session exits
  // rather than waiting for the menu to unmount and remount.
  const [updateSessionId, setUpdateSessionId] = useState<string | null>(null);
  const updateSessionState = useTerminalStore((s) =>
    updateSessionId ? (s.states[updateSessionId] ?? 'idle') : 'idle',
  );
  useEffect(() => {
    if (!updateSessionId || updateSessionState !== 'exited') return;
    setUpdateSessionId(null);
    void hasPackagedBuild(repoId, worktreePath).then(setHasBuild);
  }, [updateSessionId, updateSessionState, repoId, worktreePath]);

  const actions: ProjectAction[] = [
    {
      key: 'setup',
      label: 'Set up this repo',
      buttonLabel: hasKit
        ? `Update the onboarding kit in ${repoName}`
        : `Set up the onboarding kit in ${repoName}`,
      icon: LuWrench,
      onSelect: () => setSetupOpen(true),
    },
    {
      key: 'update',
      label: 'Update Midnite Studio',
      // The no-build note is only worth showing when the button is actually
      // clickable — `IconButton` already appends `disabledReason` to this
      // string when `isStudioCheckout` is false, and a repo that fails that
      // check will also, in practice, always fail `hasBuild`, so skipping the
      // note there avoids a tooltip fighting itself over two reasons at once.
      buttonLabel:
        isStudioCheckout && !hasBuild
          ? 'Update Midnite Studio — no packaged build yet, will run dist first (several minutes, ~200MB)'
          : 'Update Midnite Studio — rebuild and install this checkout',
      icon: LuDownload,
      ...(isStudioCheckout
        ? {}
        : { disabled: true, disabledReason: 'Only for the Midnite Studio checkout' }),
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
        setUpdateSessionId(session.id);
      },
    },
  ];

  const dialog = setupOpen
    ? createPortal(
        <SetupDialog
          repoId={repoId}
          repoName={repoName}
          hasExistingKit={hasKit}
          onClose={() => {
            setSetupOpen(false);
            // The dialog may have just written a `.midnite/`, or updated an
            // existing one — re-read so the wording is right the next time
            // this action is drawn, without waiting for a repo re-select.
            void hasMidniteDir(repoId, worktreePath).then(setHasKit);
          }}
        />,
        document.body,
      )
    : null;

  return { actions, dialog };
}

/**
 * Setup and Update as two standing icon buttons — the title bar's form of
 * them, ahead of that cluster's Install/Build/Test/Launch and separated from
 * it by the same hairline every other cluster boundary up there uses.
 *
 * Standing rather than behind an ellipsis of their own: the title bar's
 * lifecycle verbs are already one click each, and burying the two rarest
 * actions behind a menu beside four bare buttons would have been a third
 * shape for the same four-plus-two set.
 */
export function ProjectActions(target: ProjectActionsTarget) {
  const { actions, dialog } = useProjectActions(target);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {actions.map((action) => (
        <IconButton
          key={action.key}
          icon={action.icon}
          label={action.buttonLabel}
          size="sm"
          {...(action.disabled ? { disabled: true } : {})}
          {...(action.disabledReason ? { disabledReason: action.disabledReason } : {})}
          onClick={action.onSelect}
        />
      ))}
      {dialog}
    </div>
  );
}
