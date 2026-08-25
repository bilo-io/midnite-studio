import { useCallback, useEffect, useMemo } from 'react';

import { ThemeToggle } from '@bilo-io/ui';
import {
  AppFrame,
  ShellProviders,
  TitleBar,
  applyMotion,
  type NavConfig,
  type NavLinkComponent,
} from '@bilo-io/shell';
import { QueryClient } from '@tanstack/react-query';
import { ChevronLeft, FileDiff, GitBranch, Settings, type LucideIcon } from 'lucide-react';

import { Brand, BrandMark, Wordmark } from './components/brand';
import { DialogHost } from './components/dialog-host';
import { ResizeHandle } from './components/resizable/resize-handle';
import { useResizable } from './components/resizable/use-resizable';
import { GraphView } from './features/graph/graph-view';
import { ReposPanel } from './features/repos/repos-panel';
import { useDefaultSelection } from './features/repos/use-default-selection';
import { StatusPanel } from './features/status/status-panel';
import { SyncActions } from './features/status/sync-actions';
import { useFetch, usePull, usePush, useStatus } from './services/use-status';
import { FooterBar } from './features/terminal/footer-bar';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { hslTokenToHex } from './lib/color';
import { bridge } from './services/bridge';
import { useKeybindings } from './services/keybindings/use-keybindings';
import { useWatchInvalidation } from './services/watch-invalidation';
import {
  DEFAULT_LAYOUT,
  LAYOUT_BOUNDS,
  pathForView,
  useUiStore,
  viewForPath,
  type NavMode,
  type ViewId,
} from './store/ui-store';

/**
 * A QueryClient tuned for a desktop app talking to its own main process.
 *
 * No network is involved, so the usual web defaults are wrong: refetching on
 * window focus would re-run `git status` every time the user alts back into the
 * app, and retrying a failed call three times just delays an error the UI wants
 * to show. Freshness comes from the repo watcher invalidating precisely what
 * changed (Phase 10), not from polling.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

/**
 * AppFrame is router-agnostic: it takes an `activePath` string and renders links
 * through an injected component. There's no router here — a desktop window has
 * no address bar and no deep links — so navigation is a store write and the
 * "link" is a button that looks like one.
 */
const ViewLink: NavLinkComponent = ({ href, className, children, ...rest }) => {
  const setActiveView = useUiStore((s) => s.setActiveView);
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        setActiveView(viewForPath(href));
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

/**
 * The app column's box: full viewport height minus the title bar, pushed below
 * it. `--titlebar-h` is published by <TitleBar> while mounted and is absent in a
 * framed window, where the fallback of 0 is exactly right.
 */
const CONTENT_BOX = {
  height: 'calc(100vh - var(--titlebar-h, 0px))',
  marginTop: 'var(--titlebar-h, 0px)',
} as const;

const NAV_ITEMS: { view: ViewId; label: string; icon: LucideIcon }[] = [
  { view: 'graph', label: 'Graph', icon: GitBranch },
  { view: 'changes', label: 'Changes', icon: FileDiff },
  { view: 'settings', label: 'Settings', icon: Settings },
];

function Placeholder({ view }: { view: ViewId }) {
  const label = NAV_ITEMS.find((i) => i.view === view)?.label ?? view;
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <BrandMark className="h-14 w-14 opacity-80" />
      <h1 className="text-lg font-semibold tracking-tight">{label}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {selectedRepoId ? (
          <>
            Active checkout:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs" data-selectable>
              {selectedWorktreePath ?? 'main worktree'}
            </code>
            . The {label.toLowerCase()} view lands in a later phase — see{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">todo/</code>.
          </>
        ) : (
          <>Select a repository on the left to get started.</>
        )}
      </p>
    </div>
  );
}

/**
 * Locks the nav rail open, or hands it back to hover.
 *
 * The two modes differ in more than persistence: `auto` hover-expands as an
 * OVERLAY, while `expanded` is the only mode that shifts the page content
 * (AppFrame sets `--nav-offset` from it). That asymmetry is what makes the lock
 * feel like a lock rather than a preference — mirroring midnite's own rail.
 *
 * `collapsed` is deliberately not reachable from here: a two-state pin is a
 * pin, a three-state one is a menu wearing a pin's clothes.
 */
function NavLockToggle({
  navMode,
  onChange,
}: {
  navMode: NavMode;
  onChange: (mode: NavMode) => void;
}) {
  const locked = navMode === 'expanded';
  return (
    <button
      type="button"
      onClick={() => onChange(locked ? 'auto' : 'expanded')}
      aria-pressed={locked}
      aria-label={locked ? 'Unlock navigation' : 'Keep navigation expanded'}
      title={locked ? 'Unlock navigation' : 'Keep navigation expanded'}
      className="ml-auto shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ChevronLeft
        aria-hidden
        className={`h-4 w-4 transition-transform duration-200 ease-in-out ${
          locked ? '' : 'rotate-180'
        }`}
      />
    </button>
  );
}

function Shell() {
  const activeView = useUiStore((s) => s.activeView);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const navMode = useUiStore((s) => s.navMode);
  const setNavMode = useUiStore((s) => s.setNavMode);
  const collapsedNavSections = useUiStore((s) => s.collapsedNavSections);
  const toggleNavSection = useUiStore((s) => s.toggleNavSection);

  const fetch = useFetch();
  const pull = usePull();
  const push = usePush();
  const { data: status } = useStatus();
  const hasUpstream = status?.branch.upstream != null;
  useDefaultSelection();
  useWatchInvalidation(useUiStore((s) => s.selectedRepoId));

  /**
   * Every shortcut and every native menu item lands here, keyed by CommandId.
   * The handlers object is rebuilt each render and the hook depends on it —
   * cheap, and it keeps the handlers closing over current state rather than a
   * stale snapshot.
   */
  useKeybindings({
    'terminal.toggle': () => useUiStore.getState().toggleTerminal(),
    'terminal.focus': () => useUiStore.getState().setTerminalOpen(true),
    'graph.focus': () => useUiStore.getState().setActiveView('graph'),
    'status.focus': () => useUiStore.getState().setActiveView('changes'),
    // Declared in the keymap and wired into the native menu since Phase 9, but
    // never given a handler — the accelerators and the menu items were inert.
    'sync.fetch': () => void fetch.mutateAsync(),
    'sync.pull': () => void pull.mutateAsync(),
    'sync.push': () => void push.mutateAsync({ setUpstream: !hasUpstream }),
  });

  const repos = useResizable({
    size: layout.reposWidth,
    onSize: (value) => setLayout('reposWidth', value),
    initial: DEFAULT_LAYOUT.reposWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.reposWidth,
  });

  /**
   * The terminal's splitter is ABOVE it, so dragging up must grow the panel —
   * `edge: 'end'`, the same inversion the right-docked detail pane needs.
   */
  const terminal = useResizable({
    size: layout.terminalHeight,
    onSize: (value) => setLayout('terminalHeight', value),
    initial: DEFAULT_LAYOUT.terminalHeight,
    axis: 'y',
    edge: 'end',
    ...LAYOUT_BOUNDS.terminalHeight,
  });

  const nav: NavConfig = useMemo(
    () => ({
      sections: [
        {
          key: 'workspace',
          items: NAV_ITEMS.map((item) => ({
            href: pathForView(item.view),
            label: item.label,
            icon: <item.icon aria-hidden className="h-4 w-4" />,
          })),
        },
      ],
      // Collapsed, the rail shows the mark alone — the wordmark would be
      // clipped to a couple of letters, which reads as a rendering bug.
      brand: ({ expanded }) => (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Brand className="px-1" showWordmark={expanded} />
          {/*
            The pin only exists while the rail is expanded. Collapsed, the rail
            is 3.5rem of icons with nowhere to put it — and it would be asking
            the user to lock open a rail they cannot currently see the contents
            of.
          */}
          {expanded ? <NavLockToggle navMode={navMode} onChange={setNavMode} /> : null}
        </div>
      ),
    }),
    [navMode, setNavMode],
  );

  // <TitleBar> renders nothing unless the bridge reports a frameless window, so
  // this is safe in a browser/jsdom context and on platforms that keep their
  // native frame.
  const windowChrome = bridge()?.windowChrome ?? null;

  const chrome = (
    <>
      <SyncActions />
      <ThemeToggle />
    </>
  );

  const titleBar = (
    <TitleBar
      windowChrome={windowChrome}
      left={<Wordmark className="text-xs" />}
      right={chrome}
    />
  );

  /**
   * <TitleBar> renders nothing unless the window is frameless — true on macOS,
   * false on every other platform and under jsdom. The sync cluster and the
   * theme toggle are app-level controls, not macOS decoration, so a framed
   * window gets its own slim strip rather than losing them entirely.
   */
  const framed = !windowChrome?.frameless;

  return (
    <AppFrame
      nav={nav}
      activePath={pathForView(activeView)}
      linkComponent={ViewLink}
      navMode={navMode}
      collapsedSections={collapsedNavSections}
      onToggleSection={toggleNavSection}
      navLabel="Views"
      titleBar={titleBar}
    >
      {/*
        The repositories panel is a fixed-width column beside the content, not
        part of AppFrame's rail: the rail is view navigation (which is global),
        while this is the app's primary object list and has to stay visible
        whichever view is active — the same split VS Code makes.

        The offset is the host's job. AppFrame pads `<main>` on the left for the
        fixed rail but NOT on the top for the title bar — the bar publishes its
        height as `--titlebar-h` on :root precisely so the in-flow app column can
        offset itself. Without this the first rows of the panel render behind the
        bar, which looks like a missing header rather than a layout bug.
      */}
      {framed ? (
        <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b border-border px-3">
          {chrome}
        </div>
      ) : null}

      <div className="flex min-h-0" style={CONTENT_BOX}>
        <aside
          className={`shrink-0 ${repos.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}
          style={{ width: repos.current }}
        >
          <ReposPanel />
        </aside>
        <ResizeHandle resizable={repos} axis="x" label="Resize repositories sidebar" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {activeView === 'graph' ? (
              <GraphView />
            ) : activeView === 'changes' ? (
              <StatusPanel />
            ) : (
              <Placeholder view={activeView} />
            )}
          </div>

          {/*
            Mounted only while open, and unmounting kills the shell. Keeping a
            hidden terminal alive would mean a stray shell per session with no
            way to see or stop it — and a 0-height xterm is exactly the state
            that breaks its renderer.
          */}
          {terminalOpen ? (
            <>
              <ResizeHandle resizable={terminal} axis="y" label="Resize terminal" />
              {/*
                No width/height transition on this one. The panel's
                ResizeObserver drives a pty resize, and animating the height
                would make the shell's column count chase the pointer a frame
                behind for the length of every drag.
              */}
              <div
                className="shrink-0 overflow-hidden border-t border-border"
                style={{ height: terminal.current }}
              >
                <TerminalPanel cwd={selectedWorktreePath} />
              </div>
            </>
          ) : null}

          <FooterBar />
        </div>
      </div>
    </AppFrame>
  );
}

/**
 * Arms or disarms every animation in the app from the OS setting.
 *
 * `@bilo-io/shell/appearance.css` ships a universal reduced-motion reset, but
 * it is keyed on `html[data-motion='reduced']` and nothing was ever setting the
 * attribute — so the whole layer sat inert.
 *
 * Resolved to `reduced`/`full` here rather than passed through as `system`:
 * the shell's `system` path is a set of per-effect `@media (prefers-reduced-motion)`
 * blocks covering the shell's OWN effects, which would leave this app's
 * keyframes (fade-in, the cascade, the fetch spinner) running against a user
 * who asked for stillness.
 */
function useMotionPreference(): void {
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => applyMotion(query.matches ? 'reduced' : 'full');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
}

/**
 * Keeps the native window backing in step with the app theme.
 *
 * Without it a resize or a rounded corner shows the launch background against a
 * light-theme UI — the window's own colour is Electron's, not the DOM's, and
 * nothing in the renderer updates it implicitly.
 */
function useWindowBackgroundSync(): void {
  const sync = useCallback(() => {
    const chrome = bridge()?.windowChrome;
    if (!chrome) return;
    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue('--background').trim();
    if (!background) return;
    chrome.setBackgroundColor(hslTokenToHex(background));
  }, []);

  // Re-run whenever the `dark` class flips on <html> — ThemeProvider's only
  // observable signal, and cheaper than subscribing to its context from here.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, [sync]);
}

export function App() {
  useWindowBackgroundSync();
  useMotionPreference();
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <Shell />
      </DialogHost>
    </ShellProviders>
  );
}
