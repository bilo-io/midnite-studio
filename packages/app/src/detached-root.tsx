import { useEffect, useRef, useState } from 'react';

import { ShellProviders } from '@bilo-io/shell';
import { QueryClient } from '@tanstack/react-query';
import type { WindowRole } from '@midnite/studio-shared';

import { DetachedWindowFrame } from './components/detached-window-frame';
import { DialogHost } from './components/dialog-host';
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

  return (
    <div className="relative h-full w-full">
      <BrowserPane shown />
    </div>
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
            <DetachedShell role={popoutRole} />
          </PaletteHost>
        </ToastHost>
      </DialogHost>
    </ShellProviders>
  );
}
