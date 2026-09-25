import { useEffect, useRef, useState } from 'react';
import { LuFolderGit2, LuGlobe, LuSquareKanban, LuUserRound, LuWorkflow } from 'react-icons/lu';

import { KILL_SCOPES, KILL_SCOPE_LABEL, type KillScope } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useFocusTrap } from '../../components/use-focus-trap';
import { useDismiss } from '../../components/use-dismiss';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import {
  EMPTY_KILL_SCOPE_CONTEXT,
  projectIdsToDisableForScope,
  sessionsForScope,
  type KillScopeContext,
} from './kill-scope';

const SCOPE_ICON: Record<KillScope, typeof LuGlobe> = {
  flow: LuWorkflow,
  project: LuSquareKanban,
  repo: LuFolderGit2,
  forgeUser: LuUserRound,
  global: LuGlobe,
};

/**
 * The one sentence above the buttons, naming exactly what Confirm does
 * (`docs/INITIAL_PLAN.md`'s own blast-radius convention, generalised past a
 * git op) — the phase doc's own worked example is `project`'s wording here.
 *
 * `cancelsRun` (Phase 97 Theme D) is `flow`-only: the run itself is also
 * cancelled, not just its terminal sessions — worth naming explicitly for
 * the all-gate case, where `count` is 0 (a gate has no pty to close) and the
 * sentence would otherwise read "Stops 0 sessions", which understates what
 * Confirm is actually about to do.
 */
function scopeSentence(scope: KillScope, count: number, automateOffCount: number, cancelsRun: boolean): string {
  const sessions = `${count} session${count === 1 ? '' : 's'}`;
  const suffix =
    automateOffCount > 0
      ? ` and turns off Auto-mate for ${automateOffCount === 1 ? 'this project board' : `${automateOffCount} project boards`}.`
      : '.';
  switch (scope) {
    case 'flow':
      return cancelsRun
        ? `Stops ${sessions} and cancels this workflow run${suffix}`
        : `Stops ${sessions} for this workflow${suffix}`;
    case 'project':
      return `Stops ${sessions} on this project board${suffix}`;
    case 'repo':
      return `Stops ${sessions} in this repository${suffix}`;
    case 'forgeUser':
      return `Stops ${sessions} started under this forge account${suffix}`;
    case 'global':
      return `Stops ${sessions} across the whole app, including plain shells${suffix}`;
  }
}

/** Whether a scope has anything to act on right now — an unavailable scope
 *  (no board open, no active forge account, no workflow open) still renders
 *  as one of the five options (the phase doc's own "five large icon
 *  options"), just disabled with a reason rather than hidden. Hiding one
 *  would make the five-option layout shift board to board, which is the
 *  opposite of what a kill switch wants to be: always the same five buttons,
 *  in the same order, whether or not this one currently does anything. */
function scopeUnavailableReason(scope: KillScope, context: KillScopeContext): string | undefined {
  switch (scope) {
    case 'flow':
      return context.flow === null ? 'No workflow is open' : undefined;
    case 'project':
      return context.project === null ? 'No project board is open' : undefined;
    case 'repo':
      return context.repo === null ? 'No repository is open' : undefined;
    case 'forgeUser':
      return context.forgeUser === null ? 'No forge account is signed in' : undefined;
    case 'global':
      return undefined;
  }
}

/** The first scope with something to act on, so the modal opens on a useful
 *  default rather than always defaulting to `flow` — narrowest-first,
 *  matching `KILL_SCOPES`' own declared order. Falls back to `global`, which
 *  is always available. */
function defaultScope(context: KillScopeContext): KillScope {
  return KILL_SCOPES.find((scope) => scopeUnavailableReason(scope, context) === undefined) ?? 'global';
}

/**
 * The five-scope kill switch (Phase 95 Theme H) — opened from
 * `automate.kill` (command palette) or the board's own Auto-mate toggle,
 * mounted once at the app root and gated on `killSwitchOpen`.
 *
 * Built as its own overlay rather than through `useDialogs().confirm` — the
 * five labelled icon buttons and the scope-dependent sentence are not a
 * shape that dialog host's `ConfirmRequest` carries, so this follows
 * `ConfirmDialog`'s own construction (fixed overlay, `useFocusTrap` +
 * `useDismiss`) rather than bending that one to fit a second shape.
 */
export function KillSwitchModal() {
  const open = useUiStore((s) => s.killSwitchOpen);
  const close = () => useUiStore.getState().closeKillSwitch();

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);
  useDismiss(open, close, { layer: 'dialog' });

  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const projectBoardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const forgeAccounts = useUiStore((s) => s.forgeAccounts);
  const forgeActiveAccountId = useUiStore((s) => s.forgeActiveAccountId);
  const automateEnabledByProject = useUiStore((s) => s.automateEnabledByProject);
  const flowWorkflowId = useUiStore((s) => s.killSwitchFlowWorkflowId);
  const flowRunId = useUiStore((s) => s.killSwitchFlowRunId);

  const repoBoardProjectId = selectedRepoId ? (projectBoardByRepo[selectedRepoId] ?? null) : null;
  const activeAccount = forgeAccounts.find((a) => a.id === forgeActiveAccountId);

  // `flow` has a real id once this modal is opened FOR a workflow run — the
  // terminal accordion group's own kill button (`sessions-view.tsx`) is the
  // one opener that passes it (Phase 95 Theme J); every other opener (the
  // command palette, a project board's own toggle) leaves it `null` and the
  // option renders disabled, exactly as it did before this theme.
  const context: KillScopeContext = {
    ...EMPTY_KILL_SCOPE_CONTEXT,
    flow: flowWorkflowId ? { workflowId: flowWorkflowId } : null,
    project: repoBoardProjectId ? { projectId: repoBoardProjectId } : null,
    repo: selectedRepoId ? { repoId: selectedRepoId } : null,
    forgeUser: activeAccount ? { forgeAccountKey: activeAccount.id } : null,
  };

  const [scope, setScope] = useState<KillScope>(() => defaultScope(context));

  // This overlay never unmounts (it is gated by `!open` below, not by a
  // parent conditionally rendering it), so `scope`'s `useState` initializer
  // only ever runs once for the app's whole life — reopening otherwise keeps
  // whatever was last picked, which is fine for the command palette/board
  // openers (remembering the last scope is reasonable) but wrong for THIS
  // opener: pre-scoping to Flow is the whole point of the group header's own
  // kill button, so a fresh `flow` context on open forces it back to `flow`
  // rather than leaving a stale scope from a previous, unrelated open.
  useEffect(() => {
    if (open && flowWorkflowId) setScope('flow');
  }, [open, flowWorkflowId]);

  if (!open) return null;

  const matching = sessionsForScope(sessions, states, scope, context);
  const automateOffProjectIds = projectIdsToDisableForScope(scope, context, automateEnabledByProject, repoBoardProjectId);

  const handleConfirm = (): void => {
    for (const projectId of automateOffProjectIds) {
      useUiStore.getState().setAutomateEnabled(projectId, false);
    }
    for (const session of matching) {
      useTerminalStore.getState().closeSession(session.id);
    }
    /*
      Phase 97 Theme D — the Flow scope cancels the run itself, not only its
      terminal sessions. A `gate` node has no pty to close (it settles from a
      decide, not a shell exiting), so a waiting gate was completely
      unstoppable via this modal before `killSwitchFlowRunId` existed —
      closing zero matching sessions and reporting nothing to confirm.
      `runId` is only ever set when this modal was opened FOR a specific
      workflow run (`sessions-view.tsx`'s own kill button); the command
      palette / project-board openers leave it `null`, so this never fires
      for them.
    */
    if (scope === 'flow' && flowRunId) {
      void bridge()?.workflow.cancel({ runId: flowRunId });
    }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Auto-mate kill switch"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-destructive/60 bg-popover shadow-xl ring-1 ring-destructive/25"
      >
        <div className="p-4">
          <h2 className="text-sm font-semibold text-destructive">Kill switch</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a scope, then Confirm to stop it — everything else keeps running.
          </p>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {KILL_SCOPES.map((option) => {
              const Icon = SCOPE_ICON[option];
              const reason = scopeUnavailableReason(option, context);
              const selected = scope === option;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={reason !== undefined}
                  aria-pressed={selected}
                  title={reason}
                  onClick={() => setScope(option)}
                  className={`flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-border text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                  {KILL_SCOPE_LABEL[option]}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs font-medium text-destructive">
            {scopeSentence(scope, matching.length, automateOffProjectIds.length, scope === 'flow' && Boolean(flowRunId))}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={close}
              autoFocus
              className="h-8 flex-1 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                matching.length === 0 &&
                automateOffProjectIds.length === 0 &&
                !(scope === 'flow' && flowRunId)
              }
              className="h-8 flex-1 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
