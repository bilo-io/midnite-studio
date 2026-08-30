import { useQueryClient } from '@tanstack/react-query';

import type { CommandId } from '@midnite/studio-shared';

import { useDialogs } from '../../components/dialog-host';
import { useGraphStore } from '../../features/graph/graph-store';
import { useSlidesStore } from '../../features/slides/slides-store';
import { syncAffordances } from '../../features/status/sync-availability';
import { useBrowserStore } from '../../store/browser-store';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { useFileEditorStore } from '../../store/file-editor-store';
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
  const browserOpen = useUiStore((s) => s.browserOpen);
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

  const editorTarget = useFileEditorStore((s) => s.target);
  const editorDirty = useFileEditorStore((s) => s.target !== null && s.content !== s.savedContent);

  const activeMarkdown = useSlidesStore((s) => s.activeMarkdown);

  return {
    'file.save': editorTarget
      ? {
          enabled: editorDirty,
          ...(editorDirty ? {} : { disabledReason: 'No unsaved changes' }),
          run: () => void useFileEditorStore.getState().save(),
        }
      : { enabled: false, disabledReason: 'No file open for editing', run: () => {} },

    'terminal.toggle': { enabled: true, run: () => useUiStore.getState().toggleTerminal() },
    'terminal.toggleHalfMaximized': {
      enabled: true,
      run: () => useUiStore.getState().toggleTerminalHalfMaximized(),
    },
    'terminal.focus': { enabled: true, run: () => useUiStore.getState().setTerminalOpen(true) },
    'repos.toggle': { enabled: true, run: () => useUiStore.getState().toggleRepos() },
    'browser.toggle': { enabled: true, run: () => useUiStore.getState().toggleBrowser() },
    ...browserTabCommands(browserOpen),
    'search.open': { enabled: true, run: () => useUiStore.getState().setActiveView('search') },

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

    'view.graph': { enabled: true, run: () => useUiStore.getState().setActiveView('graph') },
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

    'markdown.presentAsSlides': activeMarkdown
      ? { enabled: true, run: () => useSlidesStore.getState().presentActive() }
      : { enabled: false, disabledReason: 'No markdown in view', run: () => {} },
  };
}

const NO_BROWSER = 'Open the browser first';

/**
 * The browser's own tab commands — only enabled while the pane is open,
 * matching `use-keybindings.ts`'s chord collision rule: a chord like Mod+w
 * means `repo.close` unless the browser owns it right now.
 */
function browserTabCommands(browserOpen: boolean): Record<
  | 'browser.newTab'
  | 'browser.closeTab'
  | 'browser.nextTab'
  | 'browser.prevTab'
  | 'browser.reopenTab'
  | 'browser.selectTab1'
  | 'browser.selectTab2'
  | 'browser.selectTab3'
  | 'browser.selectTab4'
  | 'browser.selectTab5'
  | 'browser.selectTab6'
  | 'browser.selectTab7'
  | 'browser.selectTab8'
  | 'browser.selectTab9',
  CommandEntry
> {
  if (!browserOpen) {
    const disabled = { enabled: false, disabledReason: NO_BROWSER, run: () => {} };
    return {
      'browser.newTab': disabled,
      'browser.closeTab': disabled,
      'browser.nextTab': disabled,
      'browser.prevTab': disabled,
      'browser.reopenTab': disabled,
      'browser.selectTab1': disabled,
      'browser.selectTab2': disabled,
      'browser.selectTab3': disabled,
      'browser.selectTab4': disabled,
      'browser.selectTab5': disabled,
      'browser.selectTab6': disabled,
      'browser.selectTab7': disabled,
      'browser.selectTab8': disabled,
      'browser.selectTab9': disabled,
    };
  }

  const selectTab = (n: number) => ({ enabled: true, run: () => useBrowserStore.getState().activateNth(n) });
  return {
    'browser.newTab': { enabled: true, run: () => useBrowserStore.getState().openTab() },
    'browser.closeTab': {
      enabled: true,
      run: () => {
        const { activeTabId, closeTab } = useBrowserStore.getState();
        if (activeTabId) closeTab(activeTabId);
      },
    },
    'browser.nextTab': { enabled: true, run: () => useBrowserStore.getState().cycleTab(1) },
    'browser.prevTab': { enabled: true, run: () => useBrowserStore.getState().cycleTab(-1) },
    'browser.reopenTab': { enabled: true, run: () => useBrowserStore.getState().reopenClosed() },
    'browser.selectTab1': selectTab(1),
    'browser.selectTab2': selectTab(2),
    'browser.selectTab3': selectTab(3),
    'browser.selectTab4': selectTab(4),
    'browser.selectTab5': selectTab(5),
    'browser.selectTab6': selectTab(6),
    'browser.selectTab7': selectTab(7),
    'browser.selectTab8': selectTab(8),
    'browser.selectTab9': selectTab(9),
  };
}
