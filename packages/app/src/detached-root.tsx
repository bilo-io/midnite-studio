import { useEffect, useRef, useState } from 'react';

import { ShellProviders } from '@bilo-io/shell';
import { QueryClient } from '@tanstack/react-query';
import type { AgentDefinition, WindowRole } from '@midnite/studio-shared';

import { DetachedWindowFrame } from './components/detached-window-frame';
import { DialogHost, useDialogs } from './components/dialog-host';
import { PaletteHost } from './components/palette-host';
import { ToastHost } from './components/toast-host';
import { BrowserPane } from './features/browser/browser-pane';
import { BrowserPopoutHeaderLeft } from './features/browser/tab-strip';
import { FabPanel } from './components/fab-panel';
import {
  ReposPanel,
  ReposPopoutHeaderLeft,
  ReposPopoutHeaderRight,
  ReposProvider,
} from './features/repos/repos-panel';
import {
  TerminalPopoutHeaderLeft,
  TerminalPopoutHeaderRight,
} from './features/terminal/terminal-header';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { buildNewSessionMenu } from './features/terminal/new-session-menu';
import { inMainPanel, resolveSessionAgentId, useTerminalStore } from './features/terminal/terminal-store';
import { useAgents } from './features/terminal/use-agents';
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

function ReposPopoutShell() {
  return (
    <DetachedWindowFrame
      role="repos"
      title={ROLE_TITLE.repos}
      titleBarLeft={<ReposPopoutHeaderLeft />}
      titleBarRight={<ReposPopoutHeaderRight />}
    >
      <ReposPanel showHeader={false} />
    </DetachedWindowFrame>
  );
}

function ReposPopout() {
  return (
    <ReposProvider>
      <ReposPopoutShell />
    </ReposProvider>
  );
}

function TerminalPopout() {
  const fitSignal = usePopoutFitSignal();
  const dialogs = useDialogs();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const { data: repos } = useRepos();
  const selectedRepo = repos?.find((repo) => repo.id === selectedRepoId) ?? null;
  const cwd =
    selectedWorktreePath ?? (selectedRepo ? (primaryTarget(selectedRepo).worktreePath ?? null) : null);
  const repoName = selectedRepo?.name ?? 'terminal';

  const sessions = useTerminalStore((s) => s.sessions).filter(inMainPanel);
  const activeId = useTerminalStore((s) => s.activeId);
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const activeState = useTerminalStore((s) => (activeId ? (s.states[activeId] ?? 'idle') : 'idle'));
  const activeLiveCwd = useTerminalStore((s) => (activeId ? s.liveCwd[activeId] : undefined));
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const { agents, status } = useAgents();
  const activeAgent = active
    ? agents.find((a) => a.id === resolveSessionAgentId(active, liveAgentId))
    : undefined;

  const hasLegacy = sessions.some((s) => (s as { legacy?: boolean }).legacy);
  const listable = sessions.length > 1 || hasLegacy;
  const listOpen = useUiStore((s) => s.terminalListOpen);
  const showList = listable && listOpen;

  const openNew = (agent?: AgentDefinition) => {
    if (!cwd || !selectedRepoId) return;
    useTerminalStore.getState().openSession({
      kind: agent ? 'agent' : 'shell',
      ...(agent ? { agentId: agent.id } : {}),
      title: repoName,
      cwd,
      repoId: selectedRepoId,
    });
  };

  const showNewMenu = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const items = buildNewSessionMenu({
      agents,
      status,
      hasWorktree: Boolean(cwd),
      onNewTerminal: () => openNew(),
      onNewAgent: (agent) => openNew(agent),
    });
    dialogs.openMenu({ clientX: rect.left, clientY: rect.bottom }, items);
  };

  return (
    <DetachedWindowFrame
      role="terminal"
      title={ROLE_TITLE.terminal}
      titleBarLeft={
        <TerminalPopoutHeaderLeft
          path={activeLiveCwd ?? active?.cwd ?? cwd}
          state={activeState}
          agent={activeAgent}
          repos={repos}
        />
      }
      titleBarRight={
        <TerminalPopoutHeaderRight
          listable={listable}
          showList={showList}
          onNewMenu={showNewMenu}
        />
      }
    >
      <TerminalPanel
        cwd={cwd}
        repoId={selectedRepoId}
        repoName={repoName}
        fitSignal={fitSignal}
        showHeader={false}
      />
    </DetachedWindowFrame>
  );
}

function BrowserPopout() {
  return (
    <DetachedWindowFrame
      role="browser"
      title={ROLE_TITLE.browser}
      titleBarLeft={<BrowserPopoutHeaderLeft />}
      titleBarRight={null}
    >
      <div className="relative h-full w-full">
        <BrowserPane shown showTabStrip={false} />
      </div>
    </DetachedWindowFrame>
  );
}

function FabPopout() {
  const fitSignal = usePopoutFitSignal();
  const width = useWindowWidth();
  return (
    <DetachedWindowFrame role="fab" title={ROLE_TITLE.fab}>
      <FabPanel isOpen width={width} fitSignal={fitSignal} />
    </DetachedWindowFrame>
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

  if (role === 'repos') return <ReposPopout />;
  if (role === 'terminal') return <TerminalPopout />;
  if (role === 'browser') return <BrowserPopout />;
  return <FabPopout />;
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
