import { Suspense, useEffect, useRef, useState } from 'react';

import { ShellProviders } from '@bilo-io/shell';
import { QueryClient } from '@tanstack/react-query';
import type { WindowRole } from '@midnite/studio-shared';

import { DelayedFallback } from './components/delayed-fallback';
import { DetachedWindowFrame } from './components/detached-window-frame';
import { PAGE_ROLE_TITLE } from './components/page-detach-mark';
import { VIEW_COMPONENT } from './components/view-registry';
import { DialogHost } from './components/dialog-host';
import { ErrorBoundary } from './components/error-boundary';
import { PaletteHost } from './components/palette-host';
import { ToastHost } from './components/toast-host';
import { BrowserPane } from './features/browser/browser-pane';
import { FabPanel } from './components/fab-panel';
import { ReposPanel } from './features/repos/repos-panel';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { useBroadcastSync } from './services/broadcast-sync';
import { useCommandHandlers } from './services/keybindings/use-command-handlers';
import { useKeybindings } from './services/keybindings/use-keybindings';
import { useRepos } from './services/queries';
import { primaryTarget } from './features/repos/use-repo-actions';
import { useAppearanceSync } from './store/appearance-store';
import { useUiStore } from './store/ui-store';

/**
 * A QueryClient per popout — a second renderer process has no access to the
 * main window's cache, so this window fetches its own (staleTime infinite,
 * no window-focus refetch, same as `app.tsx`'s own client). `useBroadcastSync`
 * (Theme E) keeps `selectedRepoId`/`selectedWorktreePath` current from the
 * moment it mounts, and relays a `watch` invalidation into this client — but a
 * popout still has no watcher of its own, so its data is a snapshot as of
 * mount until the first relayed change.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

/** Bumps on the popout's own resize — the equivalent of the docked panel's tween settle count. */
function usePopoutFitSignal(): number {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    const onResize = () => setSignal((s) => s + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return signal;
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

const ROLE_TITLE: Record<Exclude<WindowRole, 'main'>, string> = {
  terminal: 'Terminal',
  repos: 'Git Repos',
  fab: 'Midnite Loops',
  browser: 'Browser',
  ...PAGE_ROLE_TITLE,
};

function DetachedContent({ role }: { role: Exclude<WindowRole, 'main'> }) {
  const fitSignal = usePopoutFitSignal();
  const width = useWindowWidth();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;

  if (role === 'terminal') {
    const cwd =
      selectedWorktreePath ?? (selectedRepo ? (primaryTarget(selectedRepo).worktreePath ?? null) : null);
    return (
      <TerminalPanel
        cwd={cwd}
        repoId={selectedRepoId}
        repoName={selectedRepo?.name ?? 'terminal'}
        fitSignal={fitSignal}
      />
    );
  }

  if (role === 'repos') return <ReposPanel />;

  if (role === 'fab') return <FabPanel isOpen width={width} fitSignal={fitSignal} />;

  if (role === 'browser') {
    return (
      <div className="relative h-full w-full">
        <BrowserPane shown />
      </div>
    );
  }

  /*
    A page role: the SAME component `app.tsx` renders for that `ViewId`, from
    the one registry, mounted a second time in this window's own renderer
    process. Not a bespoke copy — a page whose popout drifted from its docked
    self would be a second implementation of the view, which is the failure
    mode `VIEW_COMPONENT` exists to prevent.

    `Suspense` because most entries in that registry are `React.lazy`, and this
    window has no `<Shell>` boundary above it to catch the promise. The `global`
    flag is not consulted: `app.tsx` uses it to decide whether a view yields to
    `EmptyWorkspace` with no repository selected, and a popout has no workspace
    to fall back to — the five detachable pages each say their own "select a
    repository" piece.
  */
  const { Component } = VIEW_COMPONENT[role];
  return (
    <Suspense fallback={<DelayedFallback />}>
      <Component />
    </Suspense>
  );
}

/**
 * The renderer tree a popout window mounts instead of `<App />` (Phase 55).
 *
 * A separate provider stack, not a subtree of `App` — a popout is a distinct
 * renderer process with its own module state, so it needs its own
 * `QueryClient`. It mounts the SAME command dispatcher and palette as the
 * main window (`useKeybindings(useCommandHandlers())`, `<PaletteHost>`) so
 * `Mod+K`, the reload pair and `window.detachActive` all work identically in
 * a popout — most navigation commands are simply no-ops here, since a
 * popout renders one panel rather than the multi-view Shell.
 *
 * The seam Phase 60 Theme B filled: `<DetachedShell>` below is the root render
 * this window has, and an error thrown under it blanks a window with no nav
 * rail to navigate away with — so the boundary goes around it, with no
 * `resetKey` (there is no view to switch to and back from) and the Try-again
 * button doing the whole job.
 */
function DetachedShell({ role }: { role: Exclude<WindowRole, 'main'> }) {
  useKeybindings(useCommandHandlers());
  // Each popout is its own renderer process with its own `appearance-store`
  // instance — without this it never applies the accent/density/font/
  // background/effects/shimmer the main window already carries, boot-time
  // `localStorage` hydration notwithstanding (E.3).
  useAppearanceSync();
  useBroadcastSync();
  return (
    <DetachedWindowFrame role={role} title={ROLE_TITLE[role]}>
      <DetachedContent role={role} />
    </DetachedWindowFrame>
  );
}

export function DetachedRoot({ role }: { role: WindowRole }) {
  const popoutRole = useRef(role === 'main' ? 'terminal' : role).current as Exclude<
    WindowRole,
    'main'
  >;
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <ToastHost>
          <PaletteHost>
            {/*
              No `resetKey`: a popout has one panel and no rail, so there is
              nothing to navigate away to and back from. Try again — which
              remounts `DetachedShell` — is the whole recovery this window has
              short of closing it.

              `label` is the panel's own title, so the card says "Terminal
              stopped rendering" rather than naming a view this window does not
              have.
            */}
            <ErrorBoundary label={ROLE_TITLE[popoutRole]}>
              <DetachedShell role={popoutRole} />
            </ErrorBoundary>
          </PaletteHost>
        </ToastHost>
      </DialogHost>
    </ShellProviders>
  );
}
