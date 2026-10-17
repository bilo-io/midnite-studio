import { lazy, type ComponentType } from 'react';

import { apiClientViews } from '@midnite/studio-feature-api-client/renderer';
import { chatsViews } from '@midnite/studio-feature-chats/renderer';
import { databaseViews } from '@midnite/studio-feature-database/renderer';
import { forgeViews } from '@midnite/studio-feature-forge/renderer';
import { testsViews } from '@midnite/studio-feature-tests/renderer';
import { councilsViews } from '@midnite/studio-feature-councils/renderer';
import { workflowsViews } from '@midnite/studio-feature-workflows/renderer';
import { modelsViews } from '@midnite/studio-feature-models/renderer';
import { notesViews } from '@midnite/studio-feature-notes/renderer';
import { monitorManifest, monitorViews } from '@midnite/studio-feature-monitor/renderer';
import { optimizerManifest, optimizerViews } from '@midnite/studio-feature-optimizer/renderer';
import { vaultManifest, vaultViews } from '@midnite/studio-feature-vault/renderer';

import { GraphView } from '@midnite/studio-frame/graph';
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
const loadCouncilsView = () => councilsViews.councils();
const CouncilsView = lazy(() => loadCouncilsView().then((Component) => ({ default: Component })));
const loadWorkflowsView = () => workflowsViews.workflows();
const WorkflowsView = lazy(() => loadWorkflowsView().then((Component) => ({ default: Component })));
const loadMediaView = () => import('../features/media/media-view');
const MediaView = lazy(() => loadMediaView().then((m) => ({ default: m.MediaView })));
const loadModelsView = () => modelsViews.models();
const ModelsView = lazy(() => loadModelsView().then((Component) => ({ default: Component })));
const loadDatabaseView = () => databaseViews.database();
const DatabaseView = lazy(() => loadDatabaseView().then((Component) => ({ default: Component })));
const loadDashboardView = () => import('../features/dashboard/dashboard-view');
const DashboardView = lazy(() => loadDashboardView().then((m) => ({ default: m.DashboardView })));
const loadFilesView = () => import('../features/files/files-view');
const FilesView = lazy(() => loadFilesView().then((m) => ({ default: m.FilesView })));
const loadSearchView = () => import('../features/search/search-view');
const SearchView = lazy(() => loadSearchView().then((m) => ({ default: m.SearchView })));
const loadActionsView = () => forgeViews.actions();
const ActionsView = lazy(() => loadActionsView().then((Component) => ({ default: Component })));
const loadTestsView = () => testsViews.tests();
const TestsView = lazy(() => loadTestsView().then((Component) => ({ default: Component })));
const loadReviewsView = () => forgeViews.reviews();
const ReviewsView = lazy(() => loadReviewsView().then((Component) => ({ default: Component })));
const loadTasksView = () => import('../features/tasks/tasks-view');
const TasksView = lazy(() => loadTasksView().then((m) => ({ default: m.TasksView })));
const loadHistoryView = () => import('../features/history/history-view');
const HistoryView = lazy(() => loadHistoryView().then((m) => ({ default: m.HistoryView })));
// Phase 113 Theme C — the first view composed from a feature package rather
// than imported from `features/`: the package hands over a loader, so the view
// keeps its own lazy chunk exactly as before.
const OptimizerPage = lazy(() => optimizerViews.optimizer().then((Component) => ({ default: Component })));
const MonitorPage = lazy(() => monitorViews.monitor().then((Component) => ({ default: Component })));
const VaultPage = lazy(() => vaultViews.vault().then((Component) => ({ default: Component })));
const loadSessionsView = () => import('../features/sessions/sessions-view');
const SessionsView = lazy(() => loadSessionsView().then((m) => ({ default: m.SessionsView })));
const loadApiClientView = () => apiClientViews.apiClient();
const ApiClientView = lazy(() => loadApiClientView().then((Component) => ({ default: Component })));
const loadNotesView = () => notesViews.notes();
const NotesView = lazy(() => loadNotesView().then((Component) => ({ default: Component })));
const loadChatsView = () => chatsViews.chats();
const ChatsView = lazy(() => loadChatsView().then((Component) => ({ default: Component })));
const loadKnowledgeView = () => import('@midnite/studio-frame/knowledge');
const KnowledgeView = lazy(() =>
  loadKnowledgeView().then((m) => ({ default: m.KnowledgeView })),
);

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
  /**
   * Opts this view into the bounded keep-alive (Phase 84 Theme G): leaving it
   * for another view does not unmount it outright. `app.tsx` keeps the
   * single last-left keep-alive view mounted `hidden` beside whichever view
   * is active, for up to `ttlMs`, so a return within that window shows the
   * same streamed rows and scroll position rather than paying to rebuild
   * them. `maxRows` is an early-eviction ceiling for a view whose own store
   * holds an unbounded buffer (the graph's streamed commits) — absent for a
   * view with nothing comparable to bound.
   *
   * Absent entirely means what it always meant: leaving unmounts immediately,
   * the same as before this theme existed.
   */
  keepAlive?: { ttlMs: number; maxRows?: number };
  /**
   * This view's own list-shaped content cascades top-to-bottom on mount,
   * reveal-after-hidden and repo switch (Phase 84 Theme K) — never on a
   * data refresh. Each such view wires `lib/use-cascade-reveal.ts`'s
   * `useCascadeReveal` itself (a `revealKey` built from its own repo id and,
   * where it is not otherwise remounted on a repo switch, a reveal counter);
   * this flag is a record of *which* views made that promise, not something
   * that drives the wiring by itself — `Component` renders with no props, so
   * there is nothing here for a view to read. `view-registry.test.ts` pins
   * the exact set the same way it already pins `global`, so widening or
   * narrowing it is a deliberate test change.
   */
  cascade?: true;
};

/** Theme G defaults — both a `Settings` surface could tune later; neither is yet. */
export const VIEW_KEEP_ALIVE_TTL_MS = 5 * 60 * 1000;
/** The graph's own row-buffer ceiling: past this, the hidden copy is dropped immediately (G.3). */
export const GRAPH_KEEP_ALIVE_MAX_ROWS = 20_000;

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
  dashboard: { Component: DashboardView, cascade: true },
  // Global (Phase 86 Theme E): pinned directly under Dashboard, and notes are
  // per-repo (`notesForRepo`) but a rail row that greys out with no repo open
  // would be a poor first impression right beside Dashboard's own. The
  // placeholder view renders its own "no repo open" empty state for that case.
  notes: { Component: NotesView, global: true },
  // Global, like Notes and Sessions: chats are stored app-wide (each carries
  // the repo it was started in), so the page must be reachable with no repo open.
  chats: { Component: ChatsView, global: true },
  // Not global (Phase 87 Theme C, unlike Notes above): a knowledge graph is
  // read from `<repo>/graphify-out/graph.json`, so it is meaningless with no
  // repo open and yields to `EmptyWorkspace` exactly like Files or Graph.
  knowledge: { Component: KnowledgeView },
  files: { Component: FilesView, cascade: true },
  search: { Component: SearchView },
  tests: { Component: TestsView },
  // Global too (Phase 61) — a database connection is not a property of an open
  // checkout, so the view stays reachable with no repository selected.
  database: { Component: DatabaseView, global: true },
  // Virtualized table rows cascade via `useCascadeReveal` (Phase 84 Theme K.5).
  tasks: { Component: TasksView, cascade: true },
  // Both keep-alive-eligible (Phase 84 Theme G): the two views a watcher-
  // driven repo re-visits most, and the two whose own state (a streamed row
  // buffer and scroll position; open tabs and a diff scroll position) is
  // expensive enough to rebuild that a bounded hidden mount pays for itself.
  graph: {
    Component: GraphView,
    keepAlive: { ttlMs: VIEW_KEEP_ALIVE_TTL_MS, maxRows: GRAPH_KEEP_ALIVE_MAX_ROWS },
    cascade: true,
  },
  actions: { Component: ActionsView, cascade: true },
  reviews: { Component: ReviewsView, cascade: true },
  history: { Component: HistoryView },
  // Global, like Settings — a council is not scoped to a repo, so it renders
  // whether or not one is selected/open.
  councils: { Component: CouncilsView, global: true },
  // Global too (Phase 43) — a workflow is not scoped to a repo.
  workflows: { Component: WorkflowsView, global: true },
  // Global (Phase 99 Theme A, inheriting Phase 44's `video`): Docs, Images and
  // Audio are repo-scoped and render their own "Open a repo" state, but Video
  // resolves a global root, so the view must stay reachable with no repo open.
  media: { Component: MediaView, global: true },
  // Global too (Phase 96 Theme C) — an Ollama daemon and its models are a
  // property of the machine, not of an open checkout.
  models: { Component: ModelsView, global: true },
  // `global: true` is the substance of this entry, not decoration: session
  // history spans repos, so without the flag the empty workspace would render
  // until one is open, making every other repo's history unreachable
  // (Phase 67 Theme E). Grouped repo headers and session items cascade via
  // `useCascadeReveal` (Theme K.5).
  sessions: { Component: SessionsView, global: true, cascade: true },
  /*
    Global, and the one member of that set the phase doc does not name: Phase 59
    added `optimizer` to the ternary above the `!selectedRepoId` guard after this
    phase was written. Smart Scan and Storage walk every registered repo and
    worktree rather than one open checkout, so a repo-less window has something
    to show — dropping it to repo-scoped here would be a silent regression
    dressed as fidelity to a stale list. `view-registry.test.ts` asserts the six,
    which is what makes any further widening a deliberate test change.
  */
  // `global` comes from the feature's manifest (Phase 113 Theme C) — the
  // package, not this table, now says whether its view needs a repo.
  optimizer: { Component: OptimizerPage, global: optimizerManifest.views[0].global },
  monitor: { Component: MonitorPage, global: monitorManifest.views[0].global },
  vault: { Component: VaultPage, global: vaultManifest.views[0].global },
  // Not global: its collections live under `.midnite/api/` in an open repo, so
  // it yields to `EmptyWorkspace` exactly like Files or Graph.
  apiClient: { Component: ApiClientView },
  settings: { Component: SettingsView, global: true },
};
