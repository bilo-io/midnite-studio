import { useQueryClient } from '@tanstack/react-query';

import type { CommandId } from '@midnite/studio-shared';

import { useDialogs } from '../../components/dialog-host';
import { activePanelBack, activePanelForward } from '../../components/panel-stack/active-panel';
import { useGraphStore } from '../../features/graph/graph-store';
import { useSlidesStore } from '../../features/slides/slides-store';
import { syncAffordances } from '../../features/status/sync-availability';
import { closeSessionWithConfirm } from '../../features/terminal/close-session';
import { onMainSurface, useTerminalStore } from '../../features/terminal/terminal-store';
import { useBrowserStore } from '../../store/browser-store';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { useFileEditorStore } from '../../store/file-editor-store';
import { usePaletteStore } from '../../store/palette-store';
import { useUiStore, type ViewId } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { useWorkflowRunCommandStore } from '../../store/workflow-run-command-store';
import { bridge } from '../bridge';
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

// Views that can ever register a `panel-stack` instance (`active-panel.ts`)
// — Councils (Phase 42) and, since Phase 50 Theme D, a board's card detail.
// `Mod+[`/`Mod+]` stay disabled everywhere else rather than firing a silent
// no-op through the registry.
const PANEL_HISTORY_VIEWS = new Set<ViewId>(['councils', 'projects']);

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
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const activeView = useUiStore((s) => s.activeView);
  const browserOpen = useUiStore((s) => s.browserOpen);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const reposOpen = useUiStore((s) => s.reposOpen);
  const terminalDetached = useUiStore((s) => s.terminalDetached);
  const reposDetached = useUiStore((s) => s.reposDetached);
  const fabDetached = useUiStore((s) => s.fabDetached);
  const browserDetached = useUiStore((s) => s.browserDetached);
  // The four *Detached flags and the panel-open flags below are main's own
  // — a popout's own ui-store instance never reflects them (see ui-store.ts).
  const isMainWindow = (bridge()?.windowRole ?? 'main') === 'main';
  // `window.detachActive`'s target — the first open, undetached panel in a
  // fixed priority order. There is no hover/focus tracking to say which
  // panel a user actually means by "active", so this covers the common
  // single-panel case rather than adding new state for it.
  const activeDetachRole =
    terminalOpen && !terminalDetached
      ? ('terminal' as const)
      : browserOpen && !browserDetached
        ? ('browser' as const)
        : fabPanelOpen && !fabDetached
          ? ('fab' as const)
          : reposOpen && !reposDetached
            ? ('repos' as const)
            : null;
  const workbenchActiveTabId = useWorkbenchStore((s) => s.activeTabId);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const terminalActiveId = useTerminalStore((s) => s.activeId);
  const activeTerminalSession =
    terminalSessions.find((s) => s.id === terminalActiveId && onMainSurface(s)) ?? null;

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
    'terminal.new': selectedRepoId && selectedWorktreePath
      ? {
          enabled: true,
          run: () => {
            useTerminalStore.getState().openSession({
              kind: 'shell',
              title: selectedRepo?.name ?? 'terminal',
              cwd: selectedWorktreePath,
              repoId: selectedRepoId,
            });
            // "Not expanded at all" — a session opened onto a collapsed panel
            // would be invisible until the user separately reached for
            // `terminal.toggle`, which defeats the point of a "new terminal"
            // shortcut.
            if (!useUiStore.getState().terminalOpen) useUiStore.getState().setTerminalOpen(true);
          },
        }
      : { enabled: false, disabledReason: NO_REPO, run: () => {} },
    'terminal.close': activeTerminalSession
      ? {
          enabled: true,
          run: () => closeSessionWithConfirm(dialogs, activeTerminalSession),
        }
      : { enabled: false, disabledReason: 'No terminal selected', run: () => {} },
    'repos.toggle': { enabled: true, run: () => useUiStore.getState().toggleRepos() },
    'browser.toggle': { enabled: true, run: () => useUiStore.getState().toggleBrowser() },
    'fab.toggle': { enabled: true, run: () => useUiStore.getState().toggleFabPanel() },
    /*
      Multi-window (Phase 55). `detach<Role>` is enabled only while that panel
      is docked — a detached panel's row is disabled with the standard
      "already open" reason, same shape as every other disabled command here.
      `detachActive` has no explicit notion of "which panel has focus" yet
      (that needs hover/focus tracking the phase doc left open), so it picks
      the first OPEN, undetached panel in a fixed priority order — terminal,
      browser, loops, repos — which covers the common single-panel case
      without new state.

      All five are disabled outright OUTSIDE the main window: they read and
      write main's OWN `ui-store` flags (`terminalOpen`, `*Detached`, …), which
      a popout's own separate store instance never reflects. Without this
      gate, `Mod+Shift+D` fired inside a popout resolves `activeDetachRole`
      against that popout's stale, frozen-at-mount snapshot and can detach an
      entirely different, still-docked panel the user never meant to touch.
    */
    'window.detachTerminal': !isMainWindow
      ? { enabled: false, disabledReason: 'Only available in the main window', run: () => {} }
      : terminalDetached
        ? { enabled: false, disabledReason: 'Already open in a detached window', run: () => {} }
        : { enabled: true, run: () => bridge()?.window.detach({ role: 'terminal' }) },
    'window.detachRepos': !isMainWindow
      ? { enabled: false, disabledReason: 'Only available in the main window', run: () => {} }
      : reposDetached
        ? { enabled: false, disabledReason: 'Already open in a detached window', run: () => {} }
        : { enabled: true, run: () => bridge()?.window.detach({ role: 'repos' }) },
    'window.detachFab': !isMainWindow
      ? { enabled: false, disabledReason: 'Only available in the main window', run: () => {} }
      : fabDetached
        ? { enabled: false, disabledReason: 'Already open in a detached window', run: () => {} }
        : {
            enabled: true,
            run: () => {
              // Collapses the docked slot so the floating FAB button
              // reappears (dimmed, per its own `fabDetached` read) rather
              // than sitting open beside a popout that already shows the
              // same panel.
              useUiStore.getState().setFabPanelOpen(false);
              bridge()?.window.detach({ role: 'fab' });
            },
          },
    'window.detachBrowser': !isMainWindow
      ? { enabled: false, disabledReason: 'Only available in the main window', run: () => {} }
      : browserDetached
        ? { enabled: false, disabledReason: 'Already open in a detached window', run: () => {} }
        : { enabled: true, run: () => bridge()?.window.detach({ role: 'browser' }) },
    'window.detachActive': !isMainWindow
      ? { enabled: false, disabledReason: 'Only available in the main window', run: () => {} }
      : activeDetachRole
        ? {
            enabled: true,
            run: () => {
              if (activeDetachRole === 'fab') useUiStore.getState().setFabPanelOpen(false);
              bridge()?.window.detach({ role: activeDetachRole });
            },
          }
        : { enabled: false, disabledReason: 'No open panel to detach', run: () => {} },
    'activity.toggle': {
      enabled: true,
      run: () => useUiStore.getState().toggleActivityTimeline(),
    },
    ...browserTabCommands(browserOpen),
    'search.open': { enabled: true, run: () => useUiStore.getState().setActiveView('search') },

    /*
      Always enabled, like `search.open` — it just opens Workflows if nothing
      more specific applies. `workflow-run-command-store.ts`'s handle exists
      only while a workflow is actually open in the view, so `.handle?.run()`
      is a harmless no-op the rest of the time rather than a second gate this
      runtime would need its own state to compute.
    */
    'workflow.run': {
      enabled: true,
      run: () => {
        useUiStore.getState().setActiveView('workflows');
        useWorkflowRunCommandStore.getState().handle?.run();
      },
    },

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

    /*
      Reload the window, and reload it bypassing the HTTP cache — the same two
      calls the title bar's reload button makes on left-click and from its
      right-click menu, routed here so the chord, the menu item and the palette
      row all resolve through the one runtime. `enabled: true` unconditionally:
      a reload needs no repo, and is the one command that still has to work
      when the app has wedged itself.
    */
    'app.reload': { enabled: true, run: () => bridge()?.window.reload(false) },
    'app.hardReload': { enabled: true, run: () => bridge()?.window.reload(true) },

    'view.graph': { enabled: true, run: () => useUiStore.getState().setActiveView('graph') },
    'view.files': { enabled: true, run: () => useUiStore.getState().setActiveView('files') },
    'view.issues': { enabled: true, run: () => useUiStore.getState().setActiveView('issues') },
    'view.video': { enabled: true, run: () => useUiStore.getState().setActiveView('video') },
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

    'app.lock': { enabled: true, run: () => useUiStore.getState().lockScreen() },
    'app.screensaver': {
      enabled: true,
      run: () => useUiStore.getState().setScreensaverOpen(true, false),
    },

    'markdown.presentAsSlides': activeMarkdown
      ? { enabled: true, run: () => useSlidesStore.getState().presentActive() }
      : { enabled: false, disabledReason: 'No markdown in view', run: () => {} },

    // Panel-local (Phase 42 Theme D, joined by Phase 50 Theme D's board card
    // panel). `activePanelBack`/`Forward` route to whichever `panel-stack` a
    // mounted view registered (see `active-panel.ts`); gating `enabled` on
    // one of the views that can ever register one is what stops `Mod+[`
    // firing silently from every other view, since the registry itself would
    // no-op there anyway.
    'panel.back': PANEL_HISTORY_VIEWS.has(activeView)
      ? { enabled: true, run: () => activePanelBack() }
      : { enabled: false, disabledReason: 'Open Councils or a Projects card first', run: () => {} },
    'panel.forward': PANEL_HISTORY_VIEWS.has(activeView)
      ? { enabled: true, run: () => activePanelForward() }
      : { enabled: false, disabledReason: 'Open Councils or a Projects card first', run: () => {} },
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
