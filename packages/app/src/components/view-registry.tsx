import { lazy, type ComponentType } from 'react';

import { GraphView } from '../features/graph/graph-view';
import type { ViewId } from '../store/ui-store';

/*
  The views, split out of the entry chunk — Phase 36 Theme C, moved here whole
  in Phase 60 Theme A.

  The entry chunk was 2.48 MB, and the reason was visible in this list: every
  view the app can *reach* was in the file the app *boots*. A user who opens the
  window to the graph paid for the settings pages, the councils runner, the
  dashboard's grid layout, the markdown renderer behind reviews, and the
  embedded browser — all before the first row of history appeared.

  Eager on purpose, and not lazy below: `GraphView` (the first paint, so
  splitting it would trade boot bytes for a boot round-trip). `EmptyWorkspace`,
  `ScreensaverHost` and `BrowserPane` are eager too but are not entries here, so
  they stay in `app.tsx`. `sessions` was the one placeholder entry in this list
  (`SessionsPlaceholder`, a lazy boundary for a centred paragraph costing more
  than it saves) until Phase 67 built the real view — lazy now, like every
  other view that is not the first paint, because it is not and it pulls in
  xterm.

  `BrowserPane` was in this list once and came back out, which is the more
  interesting case: its MOUNT has load-bearing side effects. It seeds the first
  browser tab, and `useReveal` drives its fade-in from the parent — flipping
  `shown` on the first quiet frame, ~16-32ms in. Behind a lazy boundary both go
  wrong on the first open of a session: a `Mod+T` arriving before the chunk
  lands adds a tab to an empty store and ends up with one tab instead of two (an
  e2e spec catches exactly this), and the pane mounts with `shown` already true,
  so it pops instead of fading. Preloading at idle does not fix it — the race is
  with the *user*, not with the browser's spare time.

  `.then` destructuring rather than a default export each: these are named
  exports throughout the app, and adding seventeen default re-exports to satisfy
  `React.lazy` would be a worse trade than one line of ceremony per view here.
*/
const loadSettingsView = () => import('../features/settings/settings-view');
const SettingsView = lazy(() => loadSettingsView().then((m) => ({ default: m.SettingsView })));
const loadLandingView = () => import('../features/landing/landing-view');
const LandingView = lazy(() => loadLandingView().then((m) => ({ default: m.LandingView })));
const loadCouncilsView = () => import('../features/councils/councils-view');
const CouncilsView = lazy(() => loadCouncilsView().then((m) => ({ default: m.CouncilsView })));
const loadWorkflowsView = () => import('../features/workflows/workflows-view');
const WorkflowsView = lazy(() => loadWorkflowsView().then((m) => ({ default: m.WorkflowsView })));
const loadVideoView = () => import('../features/video/video-view');
const VideoView = lazy(() => loadVideoView().then((m) => ({ default: m.VideoView })));
const loadDatabaseView = () => import('../features/database/database-view');
const DatabaseView = lazy(() => loadDatabaseView().then((m) => ({ default: m.DatabaseView })));
const loadDashboardView = () => import('../features/dashboard/dashboard-view');
const DashboardView = lazy(() => loadDashboardView().then((m) => ({ default: m.DashboardView })));
const loadFilesView = () => import('../features/files/files-view');
const FilesView = lazy(() => loadFilesView().then((m) => ({ default: m.FilesView })));
const loadSearchView = () => import('../features/search/search-view');
const SearchView = lazy(() => loadSearchView().then((m) => ({ default: m.SearchView })));
const loadWorkbench = () => import('../features/workbench/workbench');
const Workbench = lazy(() => loadWorkbench().then((m) => ({ default: m.Workbench })));
const loadActionsView = () => import('../features/actions/actions-view');
const ActionsView = lazy(() => loadActionsView().then((m) => ({ default: m.ActionsView })));
const loadTestsView = () => import('../features/tests/tests-view');
const TestsView = lazy(() => loadTestsView().then((m) => ({ default: m.TestsView })));
const loadReviewsView = () => import('../features/reviews/reviews-view');
const ReviewsView = lazy(() => loadReviewsView().then((m) => ({ default: m.ReviewsView })));
const loadIssuesView = () => import('../features/issues/issues-view');
const IssuesView = lazy(() => loadIssuesView().then((m) => ({ default: m.IssuesView })));
const loadProjectsView = () => import('../features/projects/projects-view');
const ProjectsView = lazy(() => loadProjectsView().then((m) => ({ default: m.ProjectsView })));
const loadHistoryView = () => import('../features/history/history-view');
const HistoryView = lazy(() => loadHistoryView().then((m) => ({ default: m.HistoryView })));
const loadOptimizerPage = () => import('../features/optimizer/optimizer-page');
const OptimizerPage = lazy(() => loadOptimizerPage().then((m) => ({ default: m.OptimizerPage })));
const loadSessionsView = () => import('../features/sessions/sessions-view');
const SessionsView = lazy(() => loadSessionsView().then((m) => ({ default: m.SessionsView })));
const loadApiClientView = () => import('../features/api-client/api-client-view');
const ApiClientView = lazy(() => loadApiClientView().then((m) => ({ default: m.ApiClientView })));

/**
 * One view, as data.
 *
 * `global: true` states the rule the old ternary encoded as ORDERING: a global
 * view renders whether or not a repo is selected; every other view yields to
 * `EmptyWorkspace` when `selectedRepoId` is null. Positional trivia in a
 * seventeen-branch chain is exactly the kind of rule that survives one refactor
 * and not the next, so it is a flag here and a `global || selectedRepoId`
 * expression at the single call site.
 */
export type ViewEntry = {
  /** Rendered with no props — the view reads whatever context it needs itself. */
  Component: ComponentType;
  /** Reachable with no repository selected. Absent means "needs a repo". */
  global?: true;
};

/**
 * Every `ViewId`, in `VIEW_IDS` order, with the component that renders it.
 *
 * `Record<ViewId, ViewEntry>` and deliberately **not** `Partial<…>`: adding a
 * member to `ViewId` without adding an entry here has to fail
 * `moon run :typecheck`, not fall through to a placeholder or a blank window.
 * That failure mode is the whole reason this record replaced a ternary chain —
 * `sessions` reached `Placeholder` by fallthrough for four phases, and nothing
 * in the type system had anything to say about it.
 *
 * Beside `VIEW_ICON` (`nav-icons.ts`) and `VIEW_COMMAND` (`nav-chords.ts`)
 * rather than in `store/ui-store.ts`: this one imports React components, and
 * the store stays free of JSX so it keeps testing under plain vitest without
 * jsdom.
 */
export const VIEW_COMPONENT: Record<ViewId, ViewEntry> = {
  // The landing page shows no repository, so like Settings and Councils it has
  // to be reachable ahead of the `!selectedRepoId` guard.
  landing: { Component: LandingView, global: true },
  dashboard: { Component: DashboardView },
  files: { Component: FilesView },
  search: { Component: SearchView },
  tests: { Component: TestsView },
  // Global too (Phase 61) — a database connection is not a property of an open
  // checkout, so the view stays reachable with no repository selected.
  database: { Component: DatabaseView, global: true },
  projects: { Component: ProjectsView },
  graph: { Component: GraphView },
  changes: { Component: Workbench },
  actions: { Component: ActionsView },
  reviews: { Component: ReviewsView },
  issues: { Component: IssuesView },
  history: { Component: HistoryView },
  // Global, like Settings — a council is not scoped to a repo, so it renders
  // whether or not one is selected/open.
  councils: { Component: CouncilsView, global: true },
  // Global too (Phase 43) — a workflow is not scoped to a repo.
  workflows: { Component: WorkflowsView, global: true },
  // Global too (Phase 44) — a video project is not a property of an open checkout.
  video: { Component: VideoView, global: true },
  // `global: true` is the substance of this entry, not decoration: session
  // history spans repos, so without the flag the empty workspace would render
  // until one is open, making every other repo's history unreachable
  // (Phase 67 Theme E).
  sessions: { Component: SessionsView, global: true },
  /*
    Global, and the one member of that set the phase doc does not name: Phase 59
    added `optimizer` to the ternary above the `!selectedRepoId` guard after this
    phase was written. Smart Scan and Storage walk every registered repo and
    worktree rather than one open checkout, so a repo-less window has something
    to show — dropping it to repo-scoped here would be a silent regression
    dressed as fidelity to a stale list. `view-registry.test.ts` asserts the six,
    which is what makes any further widening a deliberate test change.
  */
  optimizer: { Component: OptimizerPage, global: true },
  // Not global: its collections live under `.midnite/api/` in an open repo, so
  // it yields to `EmptyWorkspace` exactly like Files or Graph.
  apiClient: { Component: ApiClientView },
  settings: { Component: SettingsView, global: true },
};
