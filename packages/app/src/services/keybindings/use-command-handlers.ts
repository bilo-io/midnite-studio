import { useQueryClient } from '@tanstack/react-query';

import type { CommandId } from '@midnite/git-shared';

import { useDialogs } from '../../components/dialog-host';
import { useGraphStore } from '../../features/graph/graph-store';
import { syncAffordances } from '../../features/status/sync-availability';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { usePaletteStore } from '../../store/palette-store';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { useCloseRepo, usePickAndOpenRepo, useRepos } from '../queries';
import { useFetch, usePull, usePush, useStatus } from '../use-status';
import { invalidateForWatchKind } from '../watch-invalidation';

export type CommandEntry = {
  run: () => void;
  enabled: boolean;
  /** Present only when disabled — appended to the tooltip, per icon-button.tsx. */
  disabledReason?: string;
};

export type CommandRuntime = Record<CommandId, CommandEntry>;

const NO_REPO = 'Open a repository first';

/**
 * The one dispatcher every source reads: the keyboard, the native menu, and
 * the palette (Theme C+).
 *
 * Rebuilt every render, deliberately — it closes over current state (which
 * repo is selected, what the branch looks like) rather than a stale snapshot
 * taken once. `op.abort`/`op.continue` are present, per `CommandRuntime` being
 * a total map over `CommandId`, but stay disabled: Phase 22 owns operation
 * state and wiring them here would collide with the larger phase for two rows.
 */
export function useCommandHandlers(): CommandRuntime {
  const dialogs = useDialogs();
  const queryClient = useQueryClient();

  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const activeView = useUiStore((s) => s.activeView);
  const workbenchActiveTabId = useWorkbenchStore((s) => s.activeTabId);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;

  const { pickAndOpen } = usePickAndOpenRepo();
  const closeRepo = useCloseRepo();

  const { data: status } = useStatus();
  const hasUpstream = status?.branch.upstream != null;
  const fetch = useFetch();
  const pull = usePull();
  const push = usePush();
  // `useStatus` returns `EMPTY_STATUS` as placeholder data even with no repo
  // selected — gate on `selectedRepoId`, not on `status` being truthy, or
  // sync.fetch (always `on`, regardless of branch) reads as available with
  // nothing open.
  const sync = selectedRepoId && status ? syncAffordances(status.branch) : null;

  const onWorkingTree = activeView === 'changes' && workbenchActiveTabId === null;

  return {
    'terminal.toggle': { enabled: true, run: () => useUiStore.getState().toggleTerminal() },
    'terminal.focus': { enabled: true, run: () => useUiStore.getState().setTerminalOpen(true) },
    'repos.toggle': { enabled: true, run: () => useUiStore.getState().toggleRepos() },
    'browser.toggle': { enabled: true, run: () => useUiStore.getState().toggleBrowser() },

    'repo.open': {
      enabled: true,
      run: () => {
        void pickAndOpen().then((result) => {
          if (result && !result.ok) {
            dialogs.notify({ title: 'Could not open repository', body: result.message });
          }
        });
      },
    },
    'repo.close': selectedRepoId
      ? {
          enabled: true,
          run: () =>
            dialogs.confirm({
              title: `Close ${selectedRepo?.name ?? 'repository'}?`,
              // Matches the sidebar's own confirm verbatim (use-repo-actions.ts):
              // one safety UX for closing a repo, not a second one for this path.
              body: 'The repository is removed from this list only. Nothing on disk is touched, and you can open it again at any time.',
              confirmLabel: 'Close repository',
              danger: true,
              blastRadius: null,
              onConfirm: () => closeRepo.mutate(selectedRepoId),
            }),
        }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },

    'view.refresh': selectedRepoId
      ? {
          enabled: true,
          run: () => {
            const { restreamGraph } = invalidateForWatchKind(queryClient, selectedRepoId, 'head');
            if (restreamGraph) useGraphStore.getState().requestRestream();
          },
        }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },

    'graph.focus': { enabled: true, run: () => useUiStore.getState().setActiveView('graph') },
    'status.focus': { enabled: true, run: () => useUiStore.getState().setActiveView('changes') },
    'status.commit':
      selectedRepoId && onWorkingTree
        ? { enabled: true, run: () => useCommitBoxStore.getState().handle?.run() }
        : {
            enabled: false,
            disabledReason: selectedRepoId ? 'Switch to the working tree to commit' : NO_REPO,
            run: () => {},
          },

    // Accelerators and menu items were inert until this theme — no scope:
    // these act on whatever is checked out, which is what they have always
    // meant. The ref badges pass a scope instead — see `SyncScope` in
    // use-status.
    'sync.fetch': sync
      ? { enabled: sync.fetch.enabled, ...(sync.fetch.reason ? { disabledReason: sync.fetch.reason } : {}), run: () => void fetch.mutateAsync({}) }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },
    'sync.pull': sync
      ? { enabled: sync.pull.enabled, ...(sync.pull.reason ? { disabledReason: sync.pull.reason } : {}), run: () => void pull.mutateAsync({}) }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },
    'sync.push': sync
      ? {
          enabled: sync.push.enabled,
          ...(sync.push.reason ? { disabledReason: sync.push.reason } : {}),
          run: () => void push.mutateAsync({ setUpstream: !hasUpstream }),
        }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },

    // Declared, unbound in the registry, and left that way here too: Phase 22
    // rebuilds operation state across its Themes A–D and owns wiring these.
    'op.abort': { enabled: false, disabledReason: 'Coming in Phase 22', run: () => {} },
    'op.continue': { enabled: false, disabledReason: 'Coming in Phase 22', run: () => {} },

    'palette.open': { enabled: true, run: () => usePaletteStore.getState().open() },
    // Pins the mode rather than typing a sigil for it: there is no file sigil
    // in the query grammar (see `parsePaletteQuery`), because the finder is
    // reached by chord, not by typing '?' or similar.
    'palette.files': { enabled: true, run: () => usePaletteStore.getState().open('files') },
  };
}
