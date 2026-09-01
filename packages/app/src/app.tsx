import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  AppFrame,
  ShellProviders,
  TitleBar,
  applyMotion,
  type NavConfig,
  type NavLinkComponent,
} from '@bilo-io/shell';
import { pickForgeRemote } from '@midnite/studio-shared';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Command as CommandIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import { CiPower } from 'react-icons/ci';
import { LuFile, LuSettings } from 'react-icons/lu';

import { Brand, BrandMark, Wordmark } from './components/brand';
import { DialogHost } from './components/dialog-host';
import { VIEW_ICON } from './components/nav-icons';
import { IconButton } from './components/icon-button';
import { PaletteHost, usePalette } from './components/palette-host';
import { ResizeHandle } from './components/resizable/resize-handle';
import { useResizable } from './components/resizable/use-resizable';
import { useReveal, useRevealSize } from './components/use-reveal';
import { ThemeToggle } from './components/theme-toggle';
import { TitleBarNav } from './components/title-bar-nav';
import { TitleBarStatus } from './features/titlebar-status/titlebar-status';
import { OnboardingModal } from './features/onboarding/onboarding-modal';
import { ScreensaverHost } from './features/screensaver/screensaver-host';
import { ActionsView } from './features/actions/actions-view';
import { CouncilsView } from './features/councils/councils-view';
import { chordFor, displayChord } from './features/status-bar/chord-hint';
import { BrowserPane } from './features/browser/browser-pane';
import { TestsView } from './features/tests/tests-view';
import { DashboardView } from './features/dashboard/dashboard-view';
import { EmptyWorkspace } from './features/empty/empty-workspace';
import { FilesView } from './features/files/files-view';
import { FileEditorGuard } from './features/files/preview/file-editor-guard';
import { GraphView } from './features/graph/graph-view';
import { RepoLifecycleActions } from './features/repos/repo-lifecycle-actions';
import { ReposPanel } from './features/repos/repos-panel';
import { useDefaultSelection } from './features/repos/use-default-selection';
import { usePruneClosedRepos } from './features/repos/use-prune-closed-repos';
import { primaryTarget } from './features/repos/use-repo-actions';
import { ReviewsView } from './features/reviews/reviews-view';
import { SearchView } from './features/search/search-view';
import { SettingsView } from './features/settings/settings-view';

import { SlidesModal } from './features/slides/slides-modal';
import { Workbench } from './features/workbench/workbench';
import { SyncActions } from './features/status/sync-actions';
import { FirstRunModal } from './features/onboarding/first-run-modal';
import { useDeepLinks } from './services/deep-link';
import { StatusBar } from './features/status-bar/status-bar';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { hslTokenToHex } from './lib/color';
import { bridge } from './services/bridge';
import { useCommandHandlers } from './services/keybindings/use-command-handlers';
import { useKeybindings } from './services/keybindings/use-keybindings';
import { keys, useRemotes, useRepos } from './services/queries';
import { useWatchInvalidation } from './services/watch-invalidation';
import { useTestsStream } from './features/tests/use-tests-stream';
import { useAppearanceSync } from './store/appearance-store';
import { useFileEditorStore } from './store/file-editor-store';
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
 * The app's box: the whole viewport, with the title bar's height held clear at
 * the top. `--titlebar-h` is published by <TitleBar> while mounted and is
 * absent in a framed window, where the fallback of 0 is exactly right.
 *
 * PADDING, not a top margin — the distinction is the whole of a bug that made
 * the app unusable. A margin here collapses straight out through `<main>` and
 * `#root`, both of which are plain blocks with no border or padding of their
 * own, so it stops being space INSIDE the page and becomes the page's own
 * offset: a 100vh document sitting 48px down, i.e. 48px taller than the window.
 *
 * `body { overflow: hidden }` hides that from the wheel but not from the
 * platform. `focus()` and `scrollIntoView()` scroll an overflow-hidden viewport
 * quite happily, and clicking into a terminal focuses xterm's hidden textarea —
 * so one click scrolled the whole app up under the fixed title bar, where the
 * bar's own controls then answered every click meant for what was behind them.
 * A maximized terminal, whose header is the topmost thing in the column, lost
 * its restore button that way and could not be put back. Nothing scrolled it
 * home either: an overflow-hidden viewport takes no user gesture.
 *
 * Padding is inside the border box, so this box is exactly 100vh however tall
 * the bar is, and the document has nothing left to scroll.
 */
const CONTENT_BOX = {
  height: '100vh',
  paddingTop: 'var(--titlebar-h, 0px)',
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
  icon: VIEW_ICON.dashboard,
};

/*
  Glyphs come from `components/nav-icons`, shared with the title bar's
  breadcrumbs — including the deliberate second and third icon families for
  Tests and Reviews, whose reasoning lives beside them there.
*/
const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { view: 'files', label: 'Files', icon: VIEW_ICON.files },
  { view: 'search', label: 'Search', icon: VIEW_ICON.search },
  { view: 'tests', label: 'Tests', icon: VIEW_ICON.tests },
];

const GIT_NAV_ITEMS: NavItem[] = [
  { view: 'graph', label: 'Graph', icon: VIEW_ICON.graph },
  { view: 'changes', label: 'Changes', icon: VIEW_ICON.changes },
  { view: 'actions', label: 'Actions', icon: VIEW_ICON.actions },
  { view: 'reviews', label: 'Reviews', icon: VIEW_ICON.reviews },
];

const AGENT_NAV_ITEMS: NavItem[] = [
  { view: 'councils', label: 'Councils', icon: VIEW_ICON.councils },
  { view: 'workflows', label: 'Workflows', icon: VIEW_ICON.workflows },
  { view: 'sessions', label: 'Sessions', icon: VIEW_ICON.sessions },
];

/** Every rail item, pinned included — the label lookup the Placeholder needs. */
const ALL_NAV_ITEMS: NavItem[] = [
  PINNED_ITEM,
  ...WORKSPACE_NAV_ITEMS,
  ...GIT_NAV_ITEMS,
  ...AGENT_NAV_ITEMS,
];

/**
 * Views that exist only because a repository has a GitHub remote — gated by
 * the one `useForgeGateAvailable` check below, in the nav filter, and in the
 * redirect effect that follows. One list rather than three separate literal
 * comparisons, so a future forge-gated view (Theme C's PR detail among them)
 * is one array entry, not three call sites to remember to update together.
 */
const FORGE_GATED_VIEWS: readonly ViewId[] = ['actions', 'reviews'];

const paletteChord = chordFor('palette.open', 'Mod+k');

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

function useAutoFetch() {
  const autoFetchIntervalMs = useUiStore((s) => s.autoFetchIntervalMs);
  const { data: repos } = useRepos();
  const client = useQueryClient();

  useEffect(() => {
    if (!autoFetchIntervalMs || autoFetchIntervalMs < 10000 || !repos || repos.length === 0) return;

    const interval = setInterval(() => {
      const api = bridge();
      if (!api) return;
      Promise.all(repos.map((repo) => api.ops.fetch({ repoId: repo.id, worktreePath: repo.path })))
        .then(() => Promise.all(repos.map((repo) => client.invalidateQueries({ queryKey: keys.repo(repo.id) }))))
        .catch(() => {});
    }, autoFetchIntervalMs);

    return () => clearInterval(interval);
  }, [autoFetchIntervalMs, repos, client]);
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
  useDeepLinks();
  const activeView = useUiStore((s) => s.activeView);
  const reposOpen = useUiStore((s) => s.reposOpen);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const terminalMaximized = useUiStore((s) => s.terminalMaximized);
  const browserOpen = useUiStore((s) => s.browserOpen);
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

  useDefaultSelection();
  usePruneClosedRepos();

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
  useAutoFetch();

  // Every shortcut, every native menu item and (Theme C+) the palette dispatch
  // through this one runtime, keyed by CommandId — see use-command-handlers.ts.
  useKeybindings(useCommandHandlers());

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

  /**
   * The terminal's height while maximized, measured rather than `flex-1`.
   *
   * A transition needs two lengths and `flex-1` is not one, so maximizing
   * animates towards the stack's own height instead — the room the column has
   * between the title bar and the footer. Measured off the stack rather than
   * computed from the window: the title bar, the framed-window chrome strip and
   * the footer each take a slice first, and the stack is what is left after all
   * of them.
   */
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [stackHeight, setStackHeight] = useState(0);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    // Measured before the first paint, so a window that launches with the
    // terminal already maximized draws it full height rather than growing into
    // it — a layout effect runs while the browser still owes us that paint.
    setStackHeight(stack.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setStackHeight(stack.clientHeight));
    observer.observe(stack);
    return () => observer.disconnect();
  }, []);

  /*
    What the panel is aiming at: the whole stack maximized, otherwise the height
    the handle was dragged to — the live drag value, so a drag still lands
    exactly where the pointer is.
  */
  const terminalTarget = terminalMaximized ? stackHeight : terminal.current;

  /*
    All three size-tweened panels (repos, terminal, its session list — the
    latter in `terminal-panel.tsx`) share this one primitive, so they cannot
    drift on duration, easing or the reduced-motion rule. The browser pane is
    NOT one of these: it tweens opacity, not a size, and keeps `useReveal`.
  */
  const reposTween = useRevealSize({
    open: reposOpen,
    size: repos.current,
    axis: 'x',
    dragging: repos.dragging,
  });
  const terminalTween = useRevealSize<HTMLDivElement>({
    open: terminalOpen,
    size: terminalTarget,
    axis: 'y',
    dragging: terminal.dragging,
    /*
      NOT the default `${open}:${size}` key: `terminalTarget` tracks the
      window's own live height while maximized (`stackHeight`, via the
      `ResizeObserver` above), and keying settle on it would re-arm the
      transition on every resize tick for as long as the window kept moving —
      the terminal's bottom edge trailing the window edge by `motionMs()`.
      Keying on the discrete open/maximize TOGGLE instead is what makes a
      live window resize apply instantly, at any size, exactly as it did
      before this hook existed.
    */
    animateKey: `${terminalOpen}:${terminalMaximized}`,
  });
  const browserReveal = useReveal(browserOpen);

  /*
    A maximized terminal covers the view — and only a terminal that is actually
    open covers anything, which is why hiding one that was left maximized hands
    the room straight back rather than blanking the column.
  */
  const covering = terminalOpen && terminalMaximized;

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
          title: 'Workspace',
          items: WORKSPACE_NAV_ITEMS.filter(
            (item) => !FORGE_GATED_VIEWS.includes(item.view) || forgeAvailable,
          ).map(navItem),
        },
        {
          key: 'git',
          title: 'Git',
          items: GIT_NAV_ITEMS.filter(
            (item) => !FORGE_GATED_VIEWS.includes(item.view) || forgeAvailable,
          ).map(navItem),
        },
        {
          key: 'agents',
          title: 'Agents',
          items: AGENT_NAV_ITEMS.filter(
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
        <div className="flex w-full flex-col gap-1">
          <button
            type="button"
            onClick={() => useUiStore.getState().setScreensaverOpen(true, true)}
            aria-label="Lock screen"
            title="Lock screen"
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              expanded ? '' : 'justify-center'
            }`}
          >
            <CiPower aria-hidden className="h-4 w-4 shrink-0" />
            {expanded ? <span>Lock screen</span> : null}
          </button>
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
        </div>
      ),
    }),
    [navMode, setNavMode, activeView, forgeAvailable, navItem],
  );

  // <TitleBar> renders nothing unless the bridge reports a frameless window, so
  // this is safe in a browser/jsdom context and on platforms that keep their
  // native frame.
  const windowChrome = bridge()?.windowChrome ?? null;

  const palette = usePalette();

  const chrome = (
    <>
      {/*
        The one entry point a keyboard shortcut nobody has been told about
        does not provide. Leads the cluster rather than sitting inside it:
        opening the palette is not a repo action or a preference, it is the
        way into every other action.
      */}
      <IconButton
        icon={CommandIcon}
        label={`Command Palette (${displayChord(paletteChord)}) — Search commands, view actions, and shortcuts`}
        onClick={() => palette.open()}
      >
        <span className="font-mono text-[10px] font-semibold opacity-70">K</span>
      </IconButton>
      <IconButton
        icon={LuFile}
        label={`Go to File (${displayChord(chordFor('palette.files', 'Mod+p'))}) — Quick search and open files by name`}
        onClick={() => palette.open('files')}
      >
        <span className="font-mono text-[10px] font-semibold opacity-70">P</span>
      </IconButton>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <TitleBarStatus />
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
      {/*
        The theme toggle is an app preference, not one of the git actions beside
        it, so it gets the same hairline the action clusters use between
        themselves rather than sitting flush against the last of them.
      */}
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
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
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
          <SyncActions />
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
      {/*
        One box for everything, sized to the viewport exactly (see CONTENT_BOX).
        The framed window's own chrome strip lives INSIDE it rather than above
        it: as a sibling it added its 40px to a box already claiming the whole
        window, which is the same 'document taller than the viewport' the
        padding fixed for the title bar — just on the platforms macOS is not.
      */}
      <div className="flex flex-col" style={CONTENT_BOX}>
        {framed ? (
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
            <div className="flex min-w-0 items-center">
              <Wordmark className="text-xs" />
              <TitleBarNav />
              <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
              <SyncActions />
            </div>
            <div className="flex items-center gap-2">{chrome}</div>
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          {/*
            Named, because it is not the only complementary landmark on the page —
            AppFrame's nav rail is an `<aside>` too, and two unlabelled ones leave
            a screen reader announcing "complementary" twice with no way to tell
            which is the repository list.
          */}
          {/*
            Unmounted when hidden — once it has finished sliding shut — not
            merely zero-width: the panel streams a per-repository status and ref
            list, and a hidden-but-live column would keep paying for a view the
            user has dismissed. Its width is layout state and survives
            independently, so it comes back the size it was.

            The handle goes with it, and travels with it on the way out: a
            splitter with nothing on its left edge is a drag target that resizes
            an invisible thing.
          */}
          {reposTween.mounted ? (
            <>
              <aside
                ref={reposTween.ref}
                aria-label="Repositories"
                // Focus target for the status bar's active-worktree segment —
                // a click that only opens the panel and leaves the keyboard
                // where it was reads as a no-op to anyone not on a mouse.
                tabIndex={-1}
                /*
                  The animated box is the aside; the panel inside keeps its full
                  width and is clipped. Reflowing the panel itself would turn
                  every frame of the slide into a fresh layout of the whole
                  repository tree — rows re-truncating, the toolbar re-wrapping —
                  which reads as the sidebar rebuilding rather than moving.
                */
                className="shrink-0 overflow-hidden"
                style={reposTween.style}
              >
                <div className="h-full" style={{ width: repos.current }}>
                  <ReposPanel />
                </div>
              </aside>
              <ResizeHandle resizable={repos} axis="x" label="Resize repositories sidebar" />
            </>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            {/*
              View, splitter and terminal share this box, but the status bar does
              not: the bar is now a sibling of this *row*, inside CONTENT_BOX one
              level up, so it spans the whole content area — repositories panel
              included. This box is therefore exactly the room those three have
              between them — no status bar, no title bar, nothing else's slice —
              which is still the right measured target for a maximized terminal.

              Why `stackHeight` survives the move: the stack is `flex-1` inside
              this column, this column is `flex-1` inside the row, and the row is
              `flex-1` inside CONTENT_BOX. Removing the 24px footer from the
              column grows the stack by 24px; adding it under the row shrinks the
              row — and therefore the column — by the same 24px. The two cancel
              and `stack.clientHeight` is unchanged. The move is only safe because
              the bar is `shrink-0 h-6` at both positions; if it ever becomes
              flexible, this reasoning stops holding.
            */}
            <div ref={stackRef} className="flex min-h-0 flex-1 flex-col">
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

                  Hidden only once the terminal has finished growing over it, too.
                  `display: none` takes the view out of the layout, and a view out
                  of the layout while the terminal is still on its way up leaves a
                  hole above it — the panel would climb through blank background
                  instead of over the thing it is covering. So it keeps its box for
                  the length of the animation, shrinking as the terminal grows, and
                  only steps out at the end.

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
                  covering && terminalTween.settled ? 'hidden' : ''
                }`}
              >
                {activeView === 'settings' ? (
                  <SettingsView />
                ) : activeView === 'councils' ? (
                  // Global, like Settings — a council is not scoped to a repo, so
                  // it renders whether or not one is selected/open.
                  <CouncilsView />
                ) : !selectedRepoId ? (
                  <EmptyWorkspace />
                ) : activeView === 'dashboard' ? (
                  <DashboardView />
                ) : activeView === 'files' ? (
                  <FilesView />
                ) : activeView === 'search' ? (
                  <SearchView />
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
                ) : (
                  <Placeholder view={activeView} />
                )}

              </div>

              {/*
                Mounted while open — and for the length of the slide shut — and
                no longer killed on hide.

                Phase 9 unmounted this deliberately, because a hidden shell had no
                UI to see or stop it. The session list is that UI, so the trade has
                flipped: a build running in a background terminal is the point, and
                losing it every time the panel is toggled was the worse cost.

                Maximized, the panel takes the whole column below the title bar and
                the resize handle goes with it — there is nothing left to resize
                against.
              */}
              {terminalTween.mounted ? (
                <>
                  {terminalMaximized ? null : (
                    <ResizeHandle resizable={terminal} axis="y" label="Resize terminal" />
                  )}
                  <div
                    ref={terminalTween.ref}
                    // Named for the e2e suite: this box, not the panel inside it,
                    // is the one that animates between the three heights.
                    data-terminal-frame
                    /*
                      Stacked above the view column as well as clipped: the view
                      clips itself now, but the terminal is the one surface in this
                      window whose chrome must never be sat on, and a z-index is a
                      cheaper guarantee of that than trusting every future pane to
                      keep its overflow to itself.

                      Two boxes, not one, and the reason is the pty. This outer box
                      is the one that animates; the panel inside it is already at
                      its final height and gets clipped. The panel's ResizeObserver
                      drives an xterm fit and a pty resize, so animating the panel
                      ITSELF would send the shell a dozen SIGWINCHes over the length
                      of every toggle and have its column count chase the animation
                      a frame behind. This way the shell is told its new size once,
                      at the start, and what moves is only the window onto it.
                    */
                    className="relative z-10 shrink-0 overflow-hidden border-t border-border"
                    style={terminalTween.style}
                  >
                    {/*
                      Top-anchored, which is what keeps the promise the header's
                      e2e test makes: the chrome is the first thing revealed and the
                      last thing to leave, so the restore and close buttons are
                      under the pointer for every frame of the animation rather than
                      clipped out of reach halfway through it.
                    */}
                    <div style={{ height: terminalTarget }}>
                      <TerminalPanel
                        cwd={selectedWorktreePath}
                        repoId={selectedRepoId}
                        repoName={selectedRepoName}
                        fitSignal={terminalTween.settleCount}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {browserReveal.mounted ? <BrowserPane shown={browserReveal.shown} /> : null}
        </div>

        <StatusBar />
        <FirstRunModal />
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

/**
 * Blocks closing the window while a file has unsaved edits.
 *
 * `beforeunload` can only refuse synchronously, and the guard dialog's
 * Save/Discard is async — so this prevents the close, opens the same
 * `pendingNav` dialog every other guarded navigation uses, and on
 * resolution flips `allowClose` and re-issues `window.close()` rather than
 * trying to un-refuse the original event.
 */
function useUnsavedCloseGuard(): void {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const editor = useFileEditorStore.getState();
      if (editor.allowClose) return;
      if (!editor.target || editor.content === editor.savedContent) return;
      event.preventDefault();
      event.returnValue = '';
      editor.guardNavigation(() => {
        useFileEditorStore.setState({ allowClose: true });
        window.close();
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}

export function App() {
  useWindowBackgroundSync();
  useMotionPreference();
  // The user's own appearance preferences, applied over the OS-derived motion
  // default above — an explicit `full`/`reduced` choice outranks the media query.
  useAppearanceSync();
  useUnsavedCloseGuard();
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <PaletteHost>
          <Shell />
          <OnboardingModal />
        </PaletteHost>
      </DialogHost>
      <FileEditorGuard />
      <SlidesModal />
      <ScreensaverHost />
    </ShellProviders>
  );
}
