import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  AppFrame,
  ShellProviders,
  TitleBar,
  applyMotion,
  type NavConfig,
  type NavLinkComponent,
} from '@bilo-io/shell';
import { pickForgeRemote } from '@midnite/git-shared';
import { QueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import type { IconType } from 'react-icons';
import { FaCodePullRequest } from 'react-icons/fa6';
import { GoBeaker } from 'react-icons/go';
import {
  LuDiff,
  LuFolderTree,
  LuGitBranch,
  LuLayoutDashboard,
  LuPlay,
  LuSettings,
} from 'react-icons/lu';

import { Brand, BrandMark, Wordmark } from './components/brand';
import { DialogHost } from './components/dialog-host';
import { ResizeHandle } from './components/resizable/resize-handle';
import { useResizable } from './components/resizable/use-resizable';
import { ThemeToggle } from './components/theme-toggle';
import { TitleBarNav } from './components/title-bar-nav';
import { ActionsView } from './features/actions/actions-view';
import { TestsView } from './features/tests/tests-view';
import { DashboardView } from './features/dashboard/dashboard-view';
import { FilesView } from './features/files/files-view';
import { GraphView } from './features/graph/graph-view';
import { RepoLifecycleActions } from './features/repos/repo-lifecycle-actions';
import { ReposPanel } from './features/repos/repos-panel';
import { useDefaultSelection } from './features/repos/use-default-selection';
import { primaryTarget } from './features/repos/use-repo-actions';
import { ReviewsView } from './features/reviews/reviews-view';
import { SettingsView } from './features/settings/settings-view';
import { Workbench } from './features/workbench/workbench';
import { SyncActions } from './features/status/sync-actions';
import { useFetch, usePull, usePush, useStatus } from './services/use-status';
import { FooterBar } from './features/terminal/footer-bar';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { hslTokenToHex } from './lib/color';
import { bridge } from './services/bridge';
import { useKeybindings } from './services/keybindings/use-keybindings';
import { useRemotes, useRepos } from './services/queries';
import { useWatchInvalidation } from './services/watch-invalidation';
import { useTestsStream } from './features/tests/use-tests-stream';
import { useAppearanceSync } from './store/appearance-store';
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

/**
 * Rail icons come from react-icons, which fronts several icon sets at once —
 * so each nav item can take the glyph that actually reads as its view rather
 * than the nearest match within one family. `IconType` is react-icons' own
 * component type, and the `Lu*` prefix names the set — a sibling elsewhere in
 * the app importing `Ai*` or `Md*` is the point of the package, not a mistake.
 *
 * "Files", not "Folder": the view is a browser for the checkout's files, and
 * naming it after the container rather than what you came looking for made it
 * read as a second sidebar. ("Explore" describes the verb, but a rail of nouns
 * with one verb in it is the odd one out.)
 */
type NavItem = { view: ViewId; label: string; icon: IconType };

/**
 * Dashboard, alone, above everything else.
 *
 * Rendered through `NavConfig.pinned` rather than as a fourth workspace entry —
 * the shell's own type documents that slot as "items rendered above the
 * sections (e.g. Dashboard), with no section header", so this asks for the slot
 * that already exists rather than a new one. It is not a view OF a checkout the
 * way Files and Graph are; it is the repository's front page, and grouping it
 * with them would say otherwise.
 */
const PINNED_ITEM: NavItem = {
  view: 'dashboard',
  label: 'Dashboard',
  icon: LuLayoutDashboard,
};

const NAV_ITEMS: NavItem[] = [
  { view: 'files', label: 'Files', icon: LuFolderTree },
  { view: 'graph', label: 'Graph', icon: LuGitBranch },
  { view: 'changes', label: 'Changes', icon: LuDiff },
  { view: 'actions', label: 'Actions', icon: LuPlay },
  // `GoBeaker` — Octicons, not Lucide. A second icon set in the rail is the
  // point of `react-icons` (see CLAUDE.md): the beaker reads as "test suite"
  // the way it does on GitHub, and taking the nearest match within one family
  // is the thing the package exists to avoid.
  { view: 'tests', label: 'Tests', icon: GoBeaker },
  // `FaCodePullRequest` — react-icons' Font Awesome 6 set, a second glyph
  // beside Tests' `GoBeaker`. Neither Lucide nor Octicons has a pull-request
  // glyph that reads as one at rail size.
  { view: 'reviews', label: 'Reviews', icon: FaCodePullRequest },
  // Settings is deliberately absent: it renders in the rail's FOOTER slot
  // (bottom-pinned, the way settings sit in VS Code/GitKraken), not among the
  // workspace views — see the `footer` in the nav config below.
];

/** Every rail item, pinned included — the label lookup the Placeholder needs. */
const ALL_NAV_ITEMS: NavItem[] = [PINNED_ITEM, ...NAV_ITEMS];

/**
 * Views that exist only because a repository has a GitHub remote — gated by
 * the one `useForgeGateAvailable` check below, in the nav filter, and in the
 * redirect effect that follows. One list rather than three separate literal
 * comparisons, so a future forge-gated view (Theme C's PR detail among them)
 * is one array entry, not three call sites to remember to update together.
 */
const FORGE_GATED_VIEWS: readonly ViewId[] = ['actions', 'reviews'];

/**
 * Whether the Actions and Reviews views have anything they could ever show.
 *
 * `gh` speaks GitHub only, so for a repository with a GitLab remote, a
 * local-path remote or no remote at all both views are permanently empty —
 * and a rail item that can only say "not applicable" is worse than no rail
 * item. The same rule already governs the sidebar's forge sections, and it is
 * the same `pickForgeRemote` all three ask — Actions and Reviews share one
 * answer because the question is about the repository's remote, not about
 * which forge surface is asking.
 *
 * "Still loading" is deliberately NOT "no". It answers with whatever it last
 * knew until the remotes arrive, which matters more than it looks: a rail
 * item disappearing is wired to a redirect, so a momentary "no" while switching
 * between two GitHub repositories would throw the user out of the very view
 * they are standing in and then put the item back a frame later.
 *
 * That held answer is a guess about a DIFFERENT repository, and deliberately
 * so — it is wrong for at most one paint, and it is corrected the moment the
 * query resolves. A cold "no" would be wrong for the same paint AND take the
 * view down with it.
 */
function useForgeGateAvailable(repoId: string | null): boolean {
  const { data: remotes } = useRemotes(repoId);
  const lastKnown = useRef(false);

  // No repo selected is a real "no", not a gap in the data — there is nothing
  // for the query to be loading, so there is nothing to hold an answer for.
  if (repoId === null) {
    lastKnown.current = false;
    return false;
  }

  if (remotes === undefined) return lastKnown.current;

  lastKnown.current = pickForgeRemote(remotes)?.forge?.kind === 'github';
  return lastKnown.current;
}

function Placeholder({ view }: { view: ViewId }) {
  const label = ALL_NAV_ITEMS.find((i) => i.view === view)?.label ?? view;
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
  const reposOpen = useUiStore((s) => s.reposOpen);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const terminalMaximized = useUiStore((s) => s.terminalMaximized);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  // The repo's own name labels its terminals; the path is the fallback for a
  // repo that has since been closed out from under a saved session.
  const { data: openRepos } = useRepos();
  const selectedRepo = openRepos?.find((repo) => repo.id === selectedRepoId) ?? null;
  const selectedRepoName = selectedRepo?.name ?? 'terminal';
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

  const forgeAvailable = useForgeGateAvailable(selectedRepoId);

  /**
   * Never leave the user standing in a view the rail no longer offers.
   *
   * Selecting a repository with no GitHub remote takes the Actions and
   * Reviews items away; without this the pane one of them named would stay
   * mounted with no way back to it and no entry showing as current, which
   * reads as the rail having lost its selection rather than as the view
   * having gone.
   *
   * Graph is the fallback because it is the app's default view — the one a
   * launch already lands on.
   */
  useEffect(() => {
    if (FORGE_GATED_VIEWS.includes(activeView) && !forgeAvailable) {
      useUiStore.getState().setActiveView('graph');
    }
  }, [activeView, forgeAvailable]);
  useWatchInvalidation(useUiStore((s) => s.selectedRepoId));
  useTestsStream();

  /**
   * Every shortcut and every native menu item lands here, keyed by CommandId.
   * The handlers object is rebuilt each render and the hook depends on it —
   * cheap, and it keeps the handlers closing over current state rather than a
   * stale snapshot.
   */
  useKeybindings({
    'terminal.toggle': () => useUiStore.getState().toggleTerminal(),
    'repos.toggle': () => useUiStore.getState().toggleRepos(),
    'terminal.focus': () => useUiStore.getState().setTerminalOpen(true),
    'graph.focus': () => useUiStore.getState().setActiveView('graph'),
    'status.focus': () => useUiStore.getState().setActiveView('changes'),
    // Declared in the keymap and wired into the native menu since Phase 9, but
    // never given a handler — the accelerators and the menu items were inert.
    // No scope: the title-bar cluster and its accelerators act on whatever is
    // checked out, which is what they have always meant. The ref badges pass a
    // scope instead — see `SyncScope` in use-status.
    'sync.fetch': () => void fetch.mutateAsync({}),
    'sync.pull': () => void pull.mutateAsync({}),
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

  const navItem = useCallback(
    (item: NavItem) => ({
      href: pathForView(item.view),
      label: item.label,
      icon: <item.icon aria-hidden className="h-4 w-4" />,
    }),
    [],
  );

  const nav: NavConfig = useMemo(
    () => ({
      // Ungrouped, above the sections — the shell's own slot for exactly this.
      pinned: [navItem(PINNED_ITEM)],
      sections: [
        {
          key: 'workspace',
          items: NAV_ITEMS.filter(
            (item) => !FORGE_GATED_VIEWS.includes(item.view) || forgeAvailable,
          ).map(navItem),
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
      /*
        Settings, pinned to the bottom of the rail (Phase 16). The footer slot
        is the shell's own bottom cluster, so no spacer hacks — but it is
        free-form, so the row restates the nav-item look by hand.
      */
      footer: ({ expanded }) => (
        <button
          type="button"
          onClick={() => useUiStore.getState().setActiveView('settings')}
          aria-label="Settings"
          aria-current={activeView === 'settings' ? 'page' : undefined}
          title="Settings"
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
            activeView === 'settings'
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          } ${expanded ? '' : 'justify-center'}`}
        >
          <LuSettings aria-hidden className="h-4 w-4 shrink-0" />
          {expanded ? <span>Settings</span> : null}
        </button>
      ),
    }),
    [navMode, setNavMode, activeView, forgeAvailable, navItem],
  );

  // <TitleBar> renders nothing unless the bridge reports a frameless window, so
  // this is safe in a browser/jsdom context and on platforms that keep their
  // native frame.
  const windowChrome = bridge()?.windowChrome ?? null;

  const chrome = (
    <>
      <SyncActions />
      {/*
        Install / Build / Test / Launch for whichever checkout is selected —
        the same cluster the sidebar shows per repository, aimed here at
        "wherever you are" rather than "this repo's main worktree". Absent
        with no repository selected: there is no checkout for a guessed
        command to run against.
      */}
      {selectedRepo ? (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <RepoLifecycleActions
            repoId={selectedRepo.id}
            repoName={selectedRepo.name}
            cwd={selectedWorktreePath ?? primaryTarget(selectedRepo).worktreePath ?? selectedRepo.path}
            {...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {})}
          />
        </>
      ) : null}
      <ThemeToggle />
    </>
  );

  const titleBar = (
    <TitleBar
      windowChrome={windowChrome}
      left={
        <div className="flex min-w-0 items-center">
          <Wordmark className="text-xs" />
          <TitleBarNav />
        </div>
      }
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
        {/*
          Named, because it is not the only complementary landmark on the page —
          AppFrame's nav rail is an `<aside>` too, and two unlabelled ones leave
          a screen reader announcing "complementary" twice with no way to tell
          which is the repository list.
        */}
        {/*
          Unmounted when hidden, not merely zero-width: the panel streams a
          per-repository status and ref list, and a hidden-but-live column would
          keep paying for a view the user has dismissed. Its width is layout
          state and survives independently, so it comes back the size it was.

          The handle goes with it. A splitter with nothing on its left edge is
          a drag target that resizes an invisible thing.
        */}
        {reposOpen ? (
          <>
            <aside
              aria-label="Repositories"
              className={`shrink-0 ${repos.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}`}
              style={{ width: repos.current }}
            >
              <ReposPanel />
            </aside>
            <ResizeHandle resizable={repos} axis="x" label="Resize repositories sidebar" />
          </>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            Keyed on the view so switching cross-fades rather than cutting.
            The key is what makes it an ENTRANCE: without it React reuses the
            same element and the animation, having already run, never replays.
          */}
          <div
            key={activeView}
            /*
              Hidden, not unmounted, while the terminal is maximized: the graph
              holds a streamed row buffer and a virtualizer scroll position, and
              tearing those down for a temporary full-screen terminal would cost
              a re-stream on the way back.

              `overflow-hidden` is the guard rail, not decoration. A view is one
              of several stacked children of this column — the terminal and the
              footer are the others — and a pane inside it that runs taller than
              its box (a tall PR header over a short window, say) otherwise
              spills its rows straight across the terminal's header. Painting
              order makes that worse than a stray pixel: the overflowing TEXT of
              an earlier sibling is drawn after the later sibling's BACKGROUND,
              so the terminal cannot cover it by being below in the DOM. Clipping
              here is what makes "a view stays inside its box" true of every
              view, present and future, rather than a property each one has to
              remember.
            */
            className={`min-h-0 flex-1 overflow-hidden animate-fade-in ${
              terminalOpen && terminalMaximized ? 'hidden' : ''
            }`}
          >
            {activeView === 'dashboard' ? (
              <DashboardView />
            ) : activeView === 'files' ? (
              <FilesView />
            ) : activeView === 'graph' ? (
              <GraphView />
            ) : activeView === 'changes' ? (
              <Workbench />
            ) : activeView === 'actions' ? (
              <ActionsView />
            ) : activeView === 'tests' ? (
              <TestsView />
            ) : activeView === 'reviews' ? (
              <ReviewsView />
            ) : activeView === 'settings' ? (
              <SettingsView />
            ) : (
              <Placeholder view={activeView} />
            )}
          </div>

          {/*
            Mounted while open, and no longer killed on hide.

            Phase 9 unmounted this deliberately, because a hidden shell had no
            UI to see or stop it. The session list is that UI, so the trade has
            flipped: a build running in a background terminal is the point, and
            losing it every time the panel is toggled was the worse cost.

            Maximized, the panel takes the whole column below the title bar and
            the resize handle goes with it — there is nothing left to resize
            against.
          */}
          {terminalOpen ? (
            <>
              {terminalMaximized ? null : (
                <ResizeHandle resizable={terminal} axis="y" label="Resize terminal" />
              )}
              {/*
                No width/height transition on this one. The panel's
                ResizeObserver drives a pty resize, and animating the height
                would make the shell's column count chase the pointer a frame
                behind for the length of every drag.
              */}
              <div
                /*
                  Stacked above the view column as well as clipped: the view
                  clips itself now, but the terminal is the one surface in this
                  window whose chrome must never be sat on, and a z-index is a
                  cheaper guarantee of that than trusting every future pane to
                  keep its overflow to itself.
                */
                className={`relative z-10 overflow-hidden border-t border-border ${
                  terminalMaximized ? 'min-h-0 flex-1' : 'shrink-0'
                }`}
                style={terminalMaximized ? undefined : { height: terminal.current }}
              >
                <TerminalPanel
                  cwd={selectedWorktreePath}
                  repoId={selectedRepoId}
                  repoName={selectedRepoName}
                />
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
  // The user's own appearance preferences, applied over the OS-derived motion
  // default above — an explicit `full`/`reduced` choice outranks the media query.
  useAppearanceSync();
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <Shell />
      </DialogHost>
    </ShellProviders>
  );
}
