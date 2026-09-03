import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import type { IconType } from 'react-icons';
import { CiPower } from 'react-icons/ci';
import { LuChevronLeft, LuSettings } from 'react-icons/lu';

import { Brand, BrandHomeButton, BrandMark, Wordmark } from './components/brand';
import { BrowserLauncher } from './features/browser/browser-launcher';
import { BrowserPane } from './features/browser/browser-pane';
import { DelayedFallback } from './components/delayed-fallback';
import { DialogHost } from './components/dialog-host';
import { ToastHost } from './components/toast-host';
import { VIEW_ICON } from './components/nav-icons';
import { navChord } from './components/nav-chords';
import { Tooltip } from './components/tooltip';
import { commandChord } from './features/status-bar/chord-hint';
import { FabPanel } from './components/fab-panel';
import { FabLoopHalo, useAnyLoopRunning } from './features/loops/fab-loop-halo';
import { useLoopAttention } from './features/loops/use-loop-attention';
import { PaletteHost } from './components/palette-host';
import { ResizeHandle } from './components/resizable/resize-handle';
import { useResizable } from './components/resizable/use-resizable';
import { useViewportWidth } from './components/use-viewport-width';
import { useReveal, useRevealSize } from './components/use-reveal';
import { ThemeToggle } from './components/theme-toggle';
import { TitleBarAgents } from './components/title-bar-agents';
import { TitleBarNav } from './components/title-bar-nav';
import { TitleBarStatus } from './features/titlebar-status/titlebar-status';
import { ScreensaverHost } from './features/screensaver/screensaver-host';
import { CommitActivityPanel } from './features/activity/commit-activity-panel';
import { EmptyWorkspace } from './features/empty/empty-workspace';
import { FileEditorGuard } from './features/files/preview/file-editor-guard';
import { GraphView } from './features/graph/graph-view';
import { ProjectActions } from './features/agent/project-actions';
import { RepoLifecycleActions } from './features/repos/repo-lifecycle-actions';
import { ReposPanel } from './features/repos/repos-panel';
import { useDefaultSelection } from './features/repos/use-default-selection';
import { usePruneClosedRepos } from './features/repos/use-prune-closed-repos';
import { primaryTarget } from './features/repos/use-repo-actions';

import { SyncActions } from './features/status/sync-actions';
import { useDeepLinks } from './services/deep-link';
import { StatusBar } from './features/status-bar/status-bar';
import { loadTerminalView } from './features/terminal/lazy-terminal-view';
import { TerminalPanel } from './features/terminal/terminal-panel';
import { useAgentActivity } from './features/terminal/use-agent-activity';
import { useSessionExits } from './features/terminal/use-session-exits';
import { hslTokenToHex } from './lib/color';
import { idlePreload } from './lib/idle-preload';
import { markOnce } from './lib/perf';
import { bridge } from './services/bridge';
import { useCommandHandlers } from './services/keybindings/use-command-handlers';
import { useKeybindings } from './services/keybindings/use-keybindings';
import { keys, useRemotes, useRepos } from './services/queries';
import { useWatchInvalidation } from './services/watch-invalidation';
import { useTestsStream } from './features/tests/use-tests-stream';
import { useAppearanceStore, useAppearanceSync } from './store/appearance-store';
import { useFileEditorStore } from './store/file-editor-store';
import {
  BROWSER_MAX_SHARE,
  DEFAULT_LAYOUT,
  FAB_PANEL_MAX_SHARE,
  LAYOUT_BOUNDS,
  pathForView,
  TERMINAL_VIEW_RESERVE,
  useUiStore,
  viewForPath,
  type NavMode,
  type ViewId,
} from './store/ui-store';

/*
  The views, split out of the entry chunk — Phase 36 Theme C.

  The entry chunk was 2.48 MB, and the reason is visible in this list: every view
  the app can *reach* was in the file the app *boots*. A user who opens the
  window to the graph paid for the settings pages, the councils runner, the
  dashboard's grid layout, the markdown renderer behind reviews, and the embedded
  browser — all before the first row of history appeared.

  Eager on purpose, and not in this list: `GraphView` (the first paint, so
  splitting it would trade boot bytes for a boot round-trip), `EmptyWorkspace`
  and `Placeholder` (a lazy boundary for what amounts to a centred paragraph
  costs more than it saves), `ScreensaverHost` (always mounted), and `BrowserPane`.

  `BrowserPane` was in this list and came back out, which is the more interesting
  case: its MOUNT has load-bearing side effects. It seeds the first browser tab,
  and `useReveal` drives its fade-in from the parent — flipping `shown` on the
  first quiet frame, ~16-32ms in. Behind a lazy boundary both go wrong on the
  first open of a session: a `Mod+T` arriving before the chunk lands adds a tab to
  an empty store and ends up with one tab instead of two (an e2e spec catches
  exactly this), and the pane mounts with `shown` already true, so it pops instead
  of fading. Preloading at idle does not fix it — the race is with the *user*, not
  with the browser's spare time. Its chunk is 25.2 KB of a 1 085 KB entry, so the
  trade is 2.3% of boot against two real defects, and a component whose mount
  seeds state is simply the wrong shape for a lazy boundary.

  `.then` destructuring rather than a default export each: these are named
  exports throughout the app, and adding fourteen default re-exports to satisfy
  `React.lazy` would be a worse trade than one line of ceremony per view here.
*/
const loadSettingsView = () => import('./features/settings/settings-view');
const SettingsView = lazy(() => loadSettingsView().then((m) => ({ default: m.SettingsView })));
const loadLandingView = () => import('./features/landing/landing-view');
const LandingView = lazy(() => loadLandingView().then((m) => ({ default: m.LandingView })));
const loadCouncilsView = () => import('./features/councils/councils-view');
const CouncilsView = lazy(() => loadCouncilsView().then((m) => ({ default: m.CouncilsView })));
const loadDashboardView = () => import('./features/dashboard/dashboard-view');
const DashboardView = lazy(() => loadDashboardView().then((m) => ({ default: m.DashboardView })));
const loadFilesView = () => import('./features/files/files-view');
const FilesView = lazy(() => loadFilesView().then((m) => ({ default: m.FilesView })));
const loadSearchView = () => import('./features/search/search-view');
const SearchView = lazy(() => loadSearchView().then((m) => ({ default: m.SearchView })));
const loadWorkbench = () => import('./features/workbench/workbench');
const Workbench = lazy(() => loadWorkbench().then((m) => ({ default: m.Workbench })));
const loadActionsView = () => import('./features/actions/actions-view');
const ActionsView = lazy(() => loadActionsView().then((m) => ({ default: m.ActionsView })));
const loadTestsView = () => import('./features/tests/tests-view');
const TestsView = lazy(() => loadTestsView().then((m) => ({ default: m.TestsView })));
const loadReviewsView = () => import('./features/reviews/reviews-view');
const ReviewsView = lazy(() => loadReviewsView().then((m) => ({ default: m.ReviewsView })));
const loadProjectsView = () => import('./features/projects/projects-view');
const ProjectsView = lazy(() => loadProjectsView().then((m) => ({ default: m.ProjectsView })));
const loadHistoryView = () => import('./features/history/history-view');
const HistoryView = lazy(() => loadHistoryView().then((m) => ({ default: m.HistoryView })));
/*
  The three rarely-shown modals. Each keeps its own boundary with a `null`
  fallback rather than joining the view boundary: they are overlays, and a
  spinner floating over the app while a modal's chunk arrives would be a worse
  frame than the modal simply appearing a beat later.
*/
const loadSlidesModal = () => import('./features/slides/slides-modal');
const SlidesModal = lazy(() => loadSlidesModal().then((m) => ({ default: m.SlidesModal })));
const loadOnboardingModal = () => import('./features/onboarding/onboarding-modal');
const OnboardingModal = lazy(() => loadOnboardingModal().then((m) => ({ default: m.OnboardingModal })));
const loadFirstRunModal = () => import('./features/onboarding/first-run-modal');
const FirstRunModal = lazy(() => loadFirstRunModal().then((m) => ({ default: m.FirstRunModal })));


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
  const chord = navChord(viewForPath(href));
  const link = (
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
  /*
    The chord, and ONLY the chord — never the label, and never inline.

    AppFrame renders a rail row as icon + label, and hover or focus anywhere in
    the rail expands it (this app only ever runs `auto` or `expanded`, so a row
    the pointer is over always has its label showing). A bubble repeating
    "Graph" beside the word Graph teaches nothing; the key it responds to is the
    one thing the row cannot say for itself. Rows whose view has no chord get no
    bubble at all rather than an empty one — see `nav-chords`.

    `side="right"`, because the rail is a vertical stack: a bubble below a row
    lands on top of the next one, which is the row the user is about to reach
    for if the tooltip just told them the wrong key.
  */
  return chord === undefined ? (
    link
  ) : (
    <Tooltip label={chord} side="right">
      {link}
    </Tooltip>
  );
};

/**
 * `app.lock`'s chord, read once — `COMMANDS` is a module constant, so there is
 * nothing here that can change between renders.
 */
const LOCK_CHORD = commandChord('app.lock');

/**
 * The rail footer's lock button — `app.lock`, with its chord on hover.
 *
 * Its own component rather than inline JSX in the footer slot because the
 * tooltip is conditional on that chord existing: `app.lock` has one today, and
 * a bubble reading `Lock screen undefined` is the failure mode of assuming it
 * always will.
 *
 * Same rule as the rail rows: the chord alone while the label is showing, the
 * label with it while the rail is a strip of icons. This slot is the one place
 * that can tell the difference — AppFrame hands it `expanded`, which a row
 * AppFrame renders itself never sees. `<Tooltip>` rather than the `title=`
 * attribute it replaces: the native one takes a second to appear, never appears
 * for a keyboard user, and arrives in the OS's colours mid-window.
 */
function RailLockButton({ expanded }: { expanded: boolean }) {
  const button = (
    <button
      type="button"
      onClick={() => useUiStore.getState().setScreensaverOpen(true, true)}
      aria-label="Lock screen"
      {...(LOCK_CHORD === undefined ? { title: 'Lock screen' } : {})}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
        expanded ? '' : 'justify-center'
      }`}
    >
      <CiPower aria-hidden className="h-4 w-4 shrink-0" />
      {expanded ? <span>Lock screen</span> : null}
    </button>
  );
  if (LOCK_CHORD === undefined) return button;
  return (
    <Tooltip label={expanded ? LOCK_CHORD : `Lock screen  ${LOCK_CHORD}`} side="right">
      {button}
    </Tooltip>
  );
}

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
 * "Explorer", not "Folder" or "Files": the view is a browser for the
 * checkout's files, and naming it after the container rather than what you
 * came looking for made it read as a second sidebar. "Explorer" is the noun
 * form — VS Code's and Windows' own name for the same job — so it keeps the
 * rail's one-noun-per-item pattern; the bare verb "Explore" was rejected for
 * exactly that reason, as the one item that wasn't a noun.
 */
type NavItem = { view: ViewId; label: string; icon: IconType };

/**
 * Dashboard, alone, above everything else.
 *
 * Rendered through `NavConfig.pinned` rather than as a fourth workspace entry —
 * the shell's own type documents that slot as "items rendered above the
 * sections (e.g. Dashboard), with no section header", so this asks for the slot
 * that already exists rather than a new one. It is not a view OF a checkout the
 * way Explorer and Graph are; it is the repository's front page, and grouping
 * it with them would say otherwise.
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
  { view: 'files', label: 'Explorer', icon: VIEW_ICON.files },
  { view: 'search', label: 'Search', icon: VIEW_ICON.search },
  { view: 'tests', label: 'Tests', icon: VIEW_ICON.tests },
];

const GIT_NAV_ITEMS: NavItem[] = [
  { view: 'graph', label: 'Graph', icon: VIEW_ICON.graph },
  { view: 'changes', label: 'Changes', icon: VIEW_ICON.changes },
  { view: 'actions', label: 'Actions', icon: VIEW_ICON.actions },
  { view: 'reviews', label: 'Reviews', icon: VIEW_ICON.reviews },
  { view: 'projects', label: 'Projects', icon: VIEW_ICON.projects },
  { view: 'history', label: 'History', icon: VIEW_ICON.history },
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
const FORGE_GATED_VIEWS: readonly ViewId[] = ['actions', 'reviews', 'projects'];

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

/**
 * Background fetch, paused while nobody is looking (Phase 36 E).
 *
 * Every tick spawns one `git fetch` per open repo, so a hidden window with
 * several repos open was doing real network and disk work — and the answer it
 * produced could not be seen. Hidden ticks are skipped; on return, a catch-up
 * fetch runs immediately if a full interval has elapsed, so the data on screen
 * is never staler than the always-on version would have made it.
 */
function useAutoFetch() {
  const autoFetchIntervalMs = useUiStore((s) => s.autoFetchIntervalMs);
  const { data: repos } = useRepos();
  const client = useQueryClient();
  const lastFetchAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!autoFetchIntervalMs || autoFetchIntervalMs < 10000 || !repos || repos.length === 0) return;

    const runFetch = () => {
      const api = bridge();
      if (!api) return;
      lastFetchAt.current = Date.now();
      Promise.all(repos.map((repo) => api.ops.fetch({ repoId: repo.id, worktreePath: repo.path })))
        .then(() => Promise.all(repos.map((repo) => client.invalidateQueries({ queryKey: keys.repo(repo.id) }))))
        .catch(() => {});
    };

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      runFetch();
    }, autoFetchIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetchAt.current >= autoFetchIntervalMs) runFetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
      <LuChevronLeft
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
  const browserLayout = useUiStore((s) => s.browserLayout);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const toggleFabPanel = useUiStore((s) => s.toggleFabPanel);
  /*
    The setters the three splitters need for their snaps: dragging a pane past
    its own minimum closes it, and dragging the terminal past the top of the
    column maximizes it. See each `useResizable` below.
  */
  const setReposOpen = useUiStore((s) => s.setReposOpen);
  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);
  const setTerminalMaximized = useUiStore((s) => s.setTerminalMaximized);
  const setFabPanelOpen = useUiStore((s) => s.setFabPanelOpen);
  const setBrowserOpen = useUiStore((s) => s.setBrowserOpen);
  const setBrowserLayout = useUiStore((s) => s.setBrowserLayout);
  // Phase 37 Theme D: the collapsed FAB wears the same tab arc as the open
  // panel, so toggling the panel never changes the button's colour.
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  // Loop mission control (Phase 35): the notice fires whether or not the FAB
  // panel is open — a loop that goes quiet unattended is the case it exists
  // for — so both live here rather than inside <FabPanel>.
  useLoopAttention();
  const loopsRunning = useAnyLoopRunning();
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
    The two drag ceilings that are not constants.

    The terminal's is the column it lives in, less a strip of the view that a
    plain drag may never cover (`TERMINAL_VIEW_RESERVE`) — cross that strip and
    the splitter snaps to maximized instead, which is what makes "drag it nearly
    to the top" and "maximize it" two distinguishable outcomes of one gesture.
    Before the stack has been measured there is nothing to derive it from, so
    the static bound stands in for the one render that needs it.

    The FAB panel's is a share of the window (`FAB_PANEL_MAX_SHARE`), floored at
    the static bound so a narrow window still allows the width its own default
    asks for.
  */
  const viewportWidth = useViewportWidth();
  const terminalMax = stackHeight
    ? Math.max(LAYOUT_BOUNDS.terminalHeight.min, stackHeight - TERMINAL_VIEW_RESERVE)
    : LAYOUT_BOUNDS.terminalHeight.max;
  const fabPanelMax = Math.max(
    LAYOUT_BOUNDS.fabPanelWidth.max,
    Math.round(viewportWidth * FAB_PANEL_MAX_SHARE),
  );
  const browserMax = Math.max(
    LAYOUT_BOUNDS.browserWidth.min,
    Math.round(viewportWidth * BROWSER_MAX_SHARE),
  );
  /*
    An even split of the real window, which is what "side by side" says and
    what a stored pixel count cannot promise across displays — see
    `LayoutSizes.browserWidth`'s `0` sentinel. Also what a double-click on the
    splitter restores, so "put it back" means the even split rather than
    whatever a past window size happened to make even.

    Minus the repositories panel, because the split is between the browser and
    the VIEW, and the panel is neither: half the raw window with the panel open
    leaves the view a third of the room and the two halves visibly unequal,
    which is the one thing the words "side by side" promise they are not. The
    committed width rather than `repos.current` — a default has no business
    tracking a live drag, and this is declared above that splitter anyway.
  */
  const browserHalf = Math.max(
    LAYOUT_BOUNDS.browserWidth.min,
    Math.round((viewportWidth - (reposOpen ? layout.reposWidth : 0)) / 2),
  );
  const browserWidth = layout.browserWidth > 0 ? layout.browserWidth : browserHalf;

  const repos = useResizable({
    size: layout.reposWidth,
    onSize: (value) => setLayout('reposWidth', value),
    initial: DEFAULT_LAYOUT.reposWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.reposWidth,
    // Dragged shut rather than only toggled shut: the splitter is already under
    // the pointer, and past the minimum there is nothing else the gesture could
    // mean. The width is left in the store, so re-opening restores it.
    onCollapse: () => setReposOpen(false),
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
    max: terminalMax,
    onCollapse: () => setTerminalOpen(false),
    onExpand: () => setTerminalMaximized(true),
  });

  /**
   * The side-by-side browser's splitter.
   *
   * `edge` flips with the layout, because the handle changes sides with the
   * pane: a browser docked left is grown by dragging right (`start`), one
   * docked right by dragging left (`end`). Dragging past the far bound does
   * what the terminal's does — past `min` closes the pane, past `max`
   * promotes it to full screen, which is the honest destination for a drag
   * that wants the whole window.
   */
  const browser = useResizable({
    size: browserWidth,
    onSize: (value) => setLayout('browserWidth', value),
    initial: browserHalf,
    axis: 'x',
    edge: browserLayout === 'right' ? 'end' : 'start',
    ...LAYOUT_BOUNDS.browserWidth,
    max: browserMax,
    onCollapse: () => setBrowserOpen(false),
    onExpand: () => setBrowserLayout('full'),
  });

  const fabPanel = useResizable({
    size: layout.fabPanelWidth,
    onSize: (value) => setLayout('fabPanelWidth', value),
    initial: DEFAULT_LAYOUT.fabPanelWidth,
    axis: 'x',
    edge: 'end',
    ...LAYOUT_BOUNDS.fabPanelWidth,
    max: fabPanelMax,
    onCollapse: () => setFabPanelOpen(false),
  });

  /*
    First-interactive, as far as the renderer can tell: a layout effect here runs
    after the view inside `stackRef` has committed, so the mark lands once the
    user has something other than the pre-paint background to look at. Beside the
    view switch rather than in `main.tsx` for exactly that reason — the entry
    module knows when React started, not when it finished.
  */
  useLayoutEffect(() => {
    markOnce('first-view-rendered');
  }, []);

  /*
    Warm the terminal's chunk once the browser is idle — Phase 36 Theme C.

    `Ctrl+`` is a single keystroke and is expected to be instant, so xterm is the
    one chunk this app pulls out of the entry and then deliberately pulls back
    in. After first paint, at idle: boot no longer pays for it, and by the time
    anyone reaches for the chord it is already in memory. An effect rather than a
    module-level call so it cannot run during SSR-shaped test renders or race the
    first commit.
  */
  useEffect(() => {
    idlePreload(loadTerminalView);
  }, []);

  /*
    What the panel is aiming at: the whole stack maximized, otherwise the height
    the handle was dragged to — the live drag value, so a drag still lands
    exactly where the pointer is.
  */
  const terminalTarget =
    terminalMaximized || terminal.snap === 'expand' ? stackHeight : terminal.current;

  /*
    What the animated FRAME draws, which is not always what the panel inside it
    is sized to. A drag that has armed a snap shows the outcome — zero for a
    collapse — while the panel keeps its real height, so the preview is a matter
    of clipping and the pty is never told the terminal is 0 rows tall and then
    told otherwise a moment later.
  */
  const terminalFrameSize = terminal.snap === 'collapse' ? 0 : terminalTarget;

  /*
    All three size-tweened panels (repos, terminal, its session list — the
    latter in `terminal-panel.tsx`) share this one primitive, so they cannot
    drift on duration, easing or the reduced-motion rule. The browser pane is
    NOT one of these: it tweens opacity, not a size, and keeps `useReveal`.
  */
  const reposTween = useRevealSize({
    open: reposOpen,
    // Zero while a drag is poised to close the panel — the same preview the
    // terminal and the FAB panel draw, and the same reason: past the minimum
    // the splitter stops following the pointer, so the pane going to nothing is
    // the only thing left that can say what letting go will do.
    size: repos.snap === 'collapse' ? 0 : repos.current,
    axis: 'x',
    dragging: repos.dragging,
  });
  const terminalTween = useRevealSize<HTMLDivElement>({
    open: terminalOpen,
    size: terminalFrameSize,
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
  /*
    The browser gets BOTH reveal primitives, one per layout, because the two
    layouts are structurally different panes: full screen is an overlay that
    fades (`useReveal`, opacity), side by side is a flex child that has to
    push the view aside as it arrives (`useRevealSize`, width). Both key on
    the same `browserOpen`, so only the one matching the current layout is
    ever rendered — and a layout change mid-open finds the other already at
    its target, which is why switching does not replay an animation.
  */
  const browserReveal = useReveal(browserOpen);
  const browserSideBySide = browserLayout !== 'full';
  const browserTween = useRevealSize<HTMLDivElement>({
    open: browserOpen,
    size: browser.snap === 'collapse' ? 0 : browser.current,
    axis: 'x',
    dragging: browser.dragging,
  });
  const fabPanelTween = useRevealSize<HTMLDivElement>({
    open: fabPanelOpen,
    size: fabPanel.snap === 'collapse' ? 0 : fabPanel.current,
    axis: 'x',
    dragging: fabPanel.dragging,
  });

  /*
    A maximized terminal covers the view — and only a terminal that is actually
    open covers anything, which is why hiding one that was left maximized hands
    the room straight back rather than blanking the column.
  */
  const covering = terminalOpen && terminalMaximized;

  /*
    The view box's classes, hoisted so the Suspense fallback outside the keyed div
    can wear them verbatim (Phase 36 Theme C) — a suspended switch must occupy the
    same box, and honour the same hidden-handling, as the view it stands in for.

    Hidden, not unmounted, while the terminal is maximized: the graph holds a
    streamed row buffer and a virtualizer scroll position, and tearing those down
    for a temporary full-screen terminal would cost a re-stream on the way back.

    Hidden only once the terminal has finished growing over it, too. `display:
    none` takes the view out of the layout, and a view out of the layout while the
    terminal is still on its way up leaves a hole above it — the panel would climb
    through blank background instead of over the thing it is covering. So it keeps
    its box for the length of the animation, shrinking as the terminal grows, and
    only steps out at the end.

    `overflow-hidden` is the guard rail, not decoration. A view is one of several
    stacked children of that column — the terminal and the footer are the others —
    and a pane inside it that runs taller than its box (a tall PR header over a
    short window, say) otherwise spills its rows straight across the terminal's
    header. Painting order makes that worse than a stray pixel: the overflowing
    TEXT of an earlier sibling is drawn after the later sibling's BACKGROUND, so
    the terminal cannot cover it by being below in the DOM. Clipping here is what
    makes "a view stays inside its box" true of every view, present and future,
    rather than a property each one has to remember.
  */
  const viewBoxClassName = `min-h-0 flex-1 overflow-hidden animate-fade-in ${
    covering && terminalTween.settled ? 'hidden' : ''
  }`;

  /**
   * The side-by-side browser, as a real column of the content row.
   *
   * Two boxes for the same reason the terminal has two: the OUTER one is what
   * the tween animates (and what draws a poised collapse as zero), while the
   * pane inside stays at its settled width and is clipped — so the browser's
   * own chrome does not re-layout on every frame of an open or close.
   *
   * `null` unless the layout asks for it, so the full-screen overlay below and
   * this are never both mounted.
   */
  const browserColumn =
    browserSideBySide && browserTween.mounted ? (
      <div
        ref={browserTween.ref}
        // Named for the e2e suite: this box, not the pane inside it, is the
        // one whose width the splitter drives.
        data-browser-frame
        className="h-full shrink-0 overflow-hidden"
        style={browserTween.style}
      >
        <div className="h-full" style={{ width: browser.current }}>
          <BrowserPane shown={browserTween.shown} />
        </div>
      </div>
    ) : null;
  const browserSplitter =
    browserSideBySide && browserTween.mounted ? (
      <ResizeHandle resizable={browser} axis="x" label="Resize browser" />
    ) : null;

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
          <BrandHomeButton className="px-1">
            <Brand showWordmark={expanded} />
          </BrandHomeButton>
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
          <RailLockButton expanded={expanded} />
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

  const chrome = (
    <>
      {/*
        The command palette and Go-to-File used to lead this cluster, as well as
        sitting in the status bar's shortcut rail. Phase 39 Theme C moved them to
        the rail only, on the argument `status-bar.tsx`'s header comment already
        makes about git status: two readings of the same thing, one at each edge
        of the window, is one more place to disagree and no more information. The
        rail is where this app teaches its own chords.

        Their trailing hairline went with them. `chrome` is rendered whole as the
        right cluster in both the frameless and the native-frame path, so a
        separator left at the head of it had nothing on its left — a 1px rule
        floating at the start of the cluster. Theme B's whole premise is that a
        separator must never be stranded; leaving one in the title bar while
        building the mechanism for the status bar would have been the same bug in
        the other half of the window.
      */}
      {/*
        Leads the cluster: the live-agent count and the four loop launchers,
        which used to be two segments in the status bar's left zone. They sit
        ahead of everything else on this side because they are the only part of
        it that changes on its own — the date, the lifecycle actions and the
        theme toggle all sit still until you touch them — and a readout that
        moves is worth the corner nearest the eye.

        `TitleBarAgents` draws its OWN trailing hairline rather than taking one
        from here, so the rule cannot outlive the cluster; see its header for
        why that had to be its responsibility and not this one's.
      */}
      <TitleBarAgents />
      <TitleBarStatus />
      {/*
        The repository's own tooling for whichever checkout is selected — the
        same set the sidebar collapses behind one ellipsis per repository,
        aimed here at "wherever you are" rather than "this repo's main
        worktree". Absent with no repository selected: there is no checkout
        for a guessed command to run against.

        Two clusters, not one: Setup and Update act on the checkout itself —
        write an onboarding kit into it, replace the installed app from it —
        while Install / Build / Test / Launch only ever type a guessed command
        at a prompt. A hairline between them says that, and it is the same
        divider the sidebar's menu draws between the same two halves.
      */}
      {selectedRepo ? (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <ProjectActions
            repoId={selectedRepo.id}
            repoName={selectedRepo.name}
            cwd={selectedWorktreePath ?? primaryTarget(selectedRepo).worktreePath ?? selectedRepo.path}
            {...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {})}
          />
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
          <BrandHomeButton>
                <Wordmark className="text-xs" />
              </BrandHomeButton>
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
              <BrandHomeButton>
                <Wordmark className="text-xs" />
              </BrandHomeButton>
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
          {/* Renders only when open AND the orientation setting says vertical. */}
          <CommitActivityPanel slot="right" />
          {/*
            A browser docked LEFT sits between the repositories panel and the
            view — not left of the repositories, which stays where it is: the
            panel is the app's object list and belongs beside the rail, while
            the split divides the working area.
          */}
          {browserLayout === 'left' ? (
            <>
              {browserColumn}
              {browserSplitter}
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
                ONE boundary for all eleven lazy views, not one each — Phase 36
                Theme C. A view switch suspends in exactly one place; eleven
                boundaries would render identically and be eleven things to keep
                in step.

                OUTSIDE the keyed div, not inside it, and that placement is the
                whole reason this comment is long. The div below is keyed on
                `activeView` precisely so `animate-fade-in` replays on every
                switch — and with the boundary *inside* that key, the first visit
                to a lazy view mounts the div, starts the 160ms animation on an
                empty box (`DelayedFallback` renders null for its first 120ms),
                and then commits the view after the animation has already
                finished, with no remount left to replay it. Outside, a suspended
                switch renders the fallback in the div's place and the keyed div
                mounts fresh — with content — when the chunk lands.

                The fallback carries the div's own classes verbatim so the box and
                the `covering && terminalTween.settled` hidden-handling hold while
                suspended too, with `DelayedFallback` inside it — nothing for the
                first 120ms, then a spinner, so a warm switch never flashes and a
                genuinely slow one still says something is happening.
              */}
              <Suspense
                fallback={
                  <div className={viewBoxClassName}>
                    <DelayedFallback />
                  </div>
                }
              >
              <div
                key={activeView}
                className={viewBoxClassName}
              >
                {/*
                  The ternary's ORDER is load-bearing and does not change:
                  `settings` and `councils` are global and must be reachable
                  *before* the `!selectedRepoId` guard, or opening Settings with
                  no repo selected would show the empty workspace instead.
                */}
                  {activeView === 'landing' ? (
                  // The landing page shows no repository, so like Settings and
                  // Councils it has to be reachable ahead of the
                  // `!selectedRepoId` guard below.
                  <LandingView />
                ) : activeView === 'settings' ? (
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
                ) : activeView === 'projects' ? (
                  <ProjectsView />
                ) : activeView === 'history' ? (
                  <HistoryView />
                ) : (
                  <Placeholder view={activeView} />
                )}

              </div>
              </Suspense>

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

          {browserLayout === 'right' ? (
            <>
              {browserSplitter}
              {browserColumn}
            </>
          ) : null}

          {/*
            Full screen only. The overlay stretches left over the nav rail (see
            `browser-pane.tsx`) and stops at the bottom of this row, which is
            what leaves the footer — a sibling of the row, one level up — alone.
          */}
          {!browserSideBySide && browserReveal.mounted ? (
            <BrowserPane shown={browserReveal.shown} />
          ) : null}

          {/* FAB Panel (docked on right) */}
          {fabPanelTween.mounted ? (
            <>
              <ResizeHandle resizable={fabPanel} axis="x" label="Resize quick access panel" />
              <div
                ref={fabPanelTween.ref}
                // Named for the e2e suite: this box, not the panel inside it,
                // is the one whose width the splitter drives.
                data-fab-panel-frame
                className="shrink-0 overflow-hidden h-full"
                style={fabPanelTween.style}
              >
                <FabPanel isOpen={fabPanelOpen} width={fabPanel.current} />
              </div>
            </>
          ) : null}

          {/* FAB Button — glows while any loop is live, ringed and haloed in the active tab's arc. */}
          <div className="absolute bottom-4 right-4 z-20 h-10 w-10">
            <FabLoopHalo tab={activeFabTab} />
            <button
              type="button"
              onClick={toggleFabPanel}
              aria-label="Open quick access panel"
              title="Quick Access"
              data-loops-running={loopsRunning.running ? 'true' : undefined}
              data-fab-tab={activeFabTab}
              /*
                `relative` is load-bearing: the halo sits at `-z-10` behind this
                button, and a static box would paint UNDER a negative-z
                positioned sibling rather than over it — the halo's opaque disc
                would swallow the brand mark. `.loop-run-glow` happens to set
                `position: relative` too, but only while a loop runs, which is
                too load-bearing a coincidence to lean on.
              */
              className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 active:scale-95 ${
                loopsRunning.running
                  ? `loop-run-glow on-primary ${
                      loopsRunning.waiting
                        ? 'is-waiting'
                        : loopsRunning.thinking
                          ? 'is-thinking'
                          : ''
                    }`
                  : ''
              }`}
            >
              <BrandMark className="h-full w-full" />
            </button>
          </div>
        </div>

        {/*
          The horizontal timeline sits between the content row and the status
          bar — a sibling of both, `shrink-0` with a fixed height, which is what
          keeps the stackHeight reasoning above intact.
        */}
        <CommitActivityPanel slot="bottom" />
        <StatusBar />
        {/*
          Eager, not lazy, and for the same reason `BrowserPane` is: this is
          what `Mod+B` puts on screen, and a modal that arrives a chunk-fetch
          after the keystroke would swallow the `Enter` that follows it.
        */}
        <BrowserLauncher />
        <Suspense fallback={null}>
          <FirstRunModal />
        </Suspense>
      </div>
    </AppFrame>
  );
}

/**
 * Arms or disarms every animation in the app from the OS setting, while the
 * stored preference is `'system'`.
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
 *
 * **Phase 46 Theme E's fix, on top of that:** this effect runs before
 * `useAppearanceSync`'s (declaration order in `App()`), so on every mount both
 * wrote `data-motion`, unconditionally, and whichever ran last won — an
 * explicit `Motion: full` choice would settle correctly at mount only to be
 * clobbered back to `'system'` by `useAppearanceSync`'s own re-run, and a
 * live OS change here would just as readily clobber an explicit choice the
 * other way. The `!== 'system'` guard below is what makes the two agree: an
 * explicit choice is `useAppearanceSync`'s to apply, exclusively, and this
 * listener only ever touches the attribute for the case it actually owns.
 */
function useMotionPreference(): void {
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (useAppearanceStore.getState().motion !== 'system') return;
      applyMotion(query.matches ? 'reduced' : 'full');
    };
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
  // The window-lifetime `pty:activity` subscription — the session list's
  // glyphs must keep tracking rung changes while every TerminalView is
  // unmounted (panel collapsed), so this cannot live inside one.
  useAgentActivity();
  // And the window-lifetime `pty:exit` subscription, for the same reason: a
  // FAB loop is meant to run with its panel closed, and main emits an exit
  // once — one missed while every TerminalView was unmounted left the loop
  // reading as live for the rest of the app run.
  useSessionExits();
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <ToastHost>
          <PaletteHost>
            <Shell />
            <Suspense fallback={null}>
              <OnboardingModal />
            </Suspense>
          </PaletteHost>
        </ToastHost>
      </DialogHost>
      <FileEditorGuard />
      <Suspense fallback={null}>
        <SlidesModal />
      </Suspense>
      <ScreensaverHost />
    </ShellProviders>
  );
}
