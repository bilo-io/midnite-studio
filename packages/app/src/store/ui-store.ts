import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  METRICS_IDLE_INTERVAL_MS,
  type LoopModel,
  type LoopSchedule,
  type MetricId,
} from '@midnite/studio-shared';

import {
  DEFAULT_GRAPH_DENSITY,
  DEFAULT_GRAPH_THEME,
  type GraphDensity,
  type GraphThemeId,
} from '../features/graph/graph-themes';
import { useFileEditorStore } from './file-editor-store';

import { adoptRenamedPersistKey } from './persist-rename';

/**
 * Collapse/expand/lock behaviour of the nav rail, mirroring `AppFrame`'s
 * `navMode` prop.
 *
 * Declared here rather than imported: `@bilo-io/shell` exports the type from
 * its `contracts` module but does not re-export it from the package entry, and
 * its `exports` map exposes only `.` and `./appearance.css` — so there is no
 * legal deep import. Three string literals are a cheap thing to keep in step,
 * and `AppFrame` would reject a drifted value at the type level anyway.
 */
export type NavMode = 'auto' | 'expanded' | 'collapsed';

/** Which edge of the terminal pane the session list docks to. */
export type TerminalSidebarSide = 'left' | 'right';

/** Active tab in the FAB panel. */
export type FabTab = 'innovate' | 'automate' | 'watchdog' | 'medic';

/** How the commit inspector lists a commit's files. */
export type CommitFileView = 'tree' | 'list';

/** What the graph's detail panel shows (Phase 22 Theme D) — see `graphSelection`. */
export type GraphSelection =
  | { kind: 'commit'; sha: string }
  | { kind: 'stash'; selector: string }
  | null;

/**
 * The main content views the rail switches between.
 *
 * Seven since Phase 19, and the rail is now the app's table of contents rather
 * than three ways to look at one checkout. `dashboard` is deliberately first:
 * it renders through `NavConfig.pinned`, ABOVE the workspace section and
 * without a header of its own, so its position in this union is the only place
 * that ordering is written down.
 */
export type ViewId =
  /**
   * The landing page, and the only view whose path is `/` rather than
   * `/<id>` — it is the app's front door, not an entry in the rail. Nothing
   * in `app.tsx`'s nav item lists names it, so it never renders a rail row;
   * it is reached from the brand mark, the title bar wordmark and the
   * palette. First in the union for the same reason `dashboard` is second:
   * position here is the only place this ordering is written down.
   */
  | 'landing'
  | 'dashboard'
  | 'files'
  | 'search'
  | 'tests'
  | 'graph'
  | 'changes'
  | 'actions'
  | 'reviews'
  | 'projects'
  | 'history'
  | 'councils'
  | 'workflows'
  | 'sessions'
  | 'settings';

/** Every view, in rail order — the domain of the per-view maps below. */
export const VIEW_IDS: readonly ViewId[] = [
  'landing',
  'dashboard',
  'files',
  'search',
  'tests',
  'graph',
  'changes',
  'actions',
  'reviews',
  'projects',
  'history',
  'councils',
  'workflows',
  'sessions',
  'settings',
];


/**
 * The pages the Settings view splits into (Phase 16). An inner sidebar, not
 * nav-rail sub-items: the rail stays view navigation, and settings pages are
 * one view's internal structure.
 */
export type SettingsPageId =
  | 'appearance'
  | 'graph'
  | 'sidebar'
  | 'search'
  | 'screenLock'
  | 'terminal'
  | 'agent'
  | 'reviews'
  | 'projects'
  | 'gitSafety'
  | 'monitor'
  | 'browser'
  | 'cli'
  | 'updates'
  | 'health';

/**
 * The categories the settings pages sort into, in UX priority order — the
 * shape midnite's own settings hub uses, brought across so the two apps read
 * as one product rather than two takes on a preferences screen.
 *
 * Groups, not a flat list, because a flat list stops scanning at about five
 * entries and this one is already there. The headers are collapsible (see
 * `collapsedSettingsGroups`) for the same reason the repositories panel's are:
 * a user who lives in one category should be able to fold the rest away.
 */
export type SettingsGroupId = 'general' | 'tools' | 'system';

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'tools', label: 'Tools' },
  { id: 'system', label: 'System Info' },
];

/**
 * Order matters twice over: within a group it is the render order, and across
 * the array it is the tab order. `group` is the only addition to what this was
 * before — every consumer that wants the flat list still gets it.
 */
export const SETTINGS_PAGES: { id: SettingsPageId; label: string; group: SettingsGroupId }[] = [
  { id: 'appearance', label: 'Appearance', group: 'general' },
  { id: 'graph', label: 'Graph', group: 'general' },
  { id: 'sidebar', label: 'Sidebar', group: 'general' },
  { id: 'search', label: 'Search', group: 'general' },
  { id: 'screenLock', label: 'Screen Lock', group: 'general' },
  { id: 'terminal', label: 'Terminal', group: 'tools' },
  { id: 'agent', label: 'Agent', group: 'tools' },
  { id: 'reviews', label: 'Reviews', group: 'tools' },
  { id: 'projects', label: 'Projects', group: 'tools' },
  { id: 'gitSafety', label: 'Git Safety', group: 'tools' },
  { id: 'browser', label: 'Browser', group: 'tools' },
  { id: 'cli', label: 'CLI Integration', group: 'system' },
  { id: 'updates', label: 'App Updates', group: 'system' },
  { id: 'health', label: 'System Health', group: 'system' },
  { id: 'monitor', label: 'Monitor & Diagnostics', group: 'system' },
];

/** Pixel sizes of the draggable panes. */
export type LayoutSizes = {
  reposWidth: number;
  terminalHeight: number;
  /** The terminal panel's session list, beside the active terminal. */
  terminalListWidth: number;
  detailWidth: number;
  changesListWidth: number;
  /** The Files view's tree pane, left of the preview. */
  filesTreeWidth: number;
  /**
   * The commit inspector's file list, above its diff.
   *
   * A drag rather than the fixed 40% it used to be: a four-file commit wastes
   * the space and a forty-file one cannot use it, and which of the two panes you
   * want tall depends entirely on whether you are picking a file or reading one.
   */
  commitFilesHeight: number;
  /** The Actions view's run list, left of the run detail. */
  actionsListWidth: number;
  /** The Tests view's suite tree, left of the suite detail. */
  testsListWidth: number;
  /** The Reviews view's PR list, left of the PR detail (Phase 20 Theme C). */
  reviewsListWidth: number;
  /** The Search view's results list, left of the detail preview (Phase 25 Theme C). */
  searchResultsWidth: number;
  /** The FAB panel width, on the right side of the content area. */
  fabPanelWidth: number;
  /** Councils' left navigation rail (Phase 42 Theme B). */
  councilNavWidth: number;
  /** Councils' right configuration panel (Phase 42 Theme B). */
  councilConfigWidth: number;
};


/** Widths of the graph table's fixed-width columns. */
export type GraphColumns = {
  /** The BRANCH / TAG column, left of the lane gutter. */
  branchTag: number;
  /**
   * The Author column — rendered only by the styles whose node is a dot
   * (`showsAuthorColumn`), sized always, so switching style and back does not
   * lose the width you dragged.
   */
  author: number;
  /**
   * The lane gutter.
   *
   * Unlike its neighbours this width is a REQUEST, not a result: the graph
   * clamps it to what the current history and style can actually paint, so a
   * value carried into a repo with more branches quietly widens to keep every
   * lane visible rather than clipping them. Stored as a plain number all the
   * same — the default is the widest gutter any style can want, which every
   * clamp turns into "as wide as the lanes need".
   */
  graph: number;
  date: number;
  sha: number;
};

export const DEFAULT_LAYOUT: LayoutSizes = {
  // Wide enough for a repository row's full contents: name, ahead/behind pair,
  // the three sync buttons and the row's three menus. At 256 the name was the
  // thing that truncated, which is the one part of the row that identifies it.
  //
  // 312, not the 288 this was, and the 24 is the midnite menu's own footprint:
  // 288 was measured against a row with two menus, and a folded row at that
  // width was already spending its last pixels on the branch name — a third
  // control took the name's first character with it. A persisted width still
  // wins, so this moves only the installs that never dragged the panel.
  reposWidth: 312,
  terminalHeight: 288,
  // Matches the list's old fixed `w-44`, so switching to a drag changes
  // nothing about how the panel looks until someone actually drags it.
  terminalListWidth: 176,
  detailWidth: 384,
  changesListWidth: 384,
  filesTreeWidth: 320,
  commitFilesHeight: 200,
  // Wider than the files tree: a run row carries a status pill, a workflow
  // name, a branch and an age, and the branch is the part that truncates first.
  actionsListWidth: 360,
  testsListWidth: 320,
  // A PR row carries two status pills, a title, a number, a branch and an
  // author — the widest row of any list pane in the app.
  reviewsListWidth: 380,
  searchResultsWidth: 420,
  fabPanelWidth: 320,
  // A council card carries a name and a member count — narrower than most
  // list panes is enough to read both.
  councilNavWidth: 260,
  // Wide enough for the member editor's three stacked controls (name,
  // provider select, role textarea) at a comfortable reading width.
  councilConfigWidth: 320,
};

export const DEFAULT_GRAPH_COLUMNS: GraphColumns = {
  branchTag: 180,
  author: 140,
  // 12 lanes at GitKraken's 30px — the widest natural gutter any style asks
  // for, so out of the box the clamp resolves it to the exact fit and the
  // column behaves as it always has until somebody drags it.
  graph: 360,
  date: 112,
  sha: 64,
};

/** Drag bounds, colocated with the defaults so nothing can clamp to a stale pair. */
export const LAYOUT_BOUNDS = {
  reposWidth: { min: 180, max: 560 },
  terminalHeight: { min: 120, max: 720 },
  // Up to 560, like the repos sidebar: an agent session's name is a summary
  // of the task it was given ("Git actions dropdown icon buttons"), so this
  // is the one list pane whose rows get longer the more useful they are.
  terminalListWidth: { min: 120, max: 560 },
  detailWidth: { min: 280, max: 720 },
  changesListWidth: { min: 240, max: 720 },
  filesTreeWidth: { min: 200, max: 640 },
  // Absolute pixels, like its neighbours — but the inspector additionally caps
  // the rendered height at a share of the pane, because these bounds cannot know
  // how tall the window is and a 720px file list in a short one would leave the
  // message above and the diff below with no room at all.
  commitFilesHeight: { min: 80, max: 720 },
  actionsListWidth: { min: 240, max: 640 },
  testsListWidth: { min: 240, max: 640 },
  reviewsListWidth: { min: 280, max: 640 },
  searchResultsWidth: { min: 280, max: 900 },
  /*
    Max is NOT this number — see `FAB_PANEL_MAX_SHARE`. The panel's ceiling is a
    share of the window, computed in `app.tsx`, and this entry exists for its
    `min` plus a fallback for a render with no window to measure.
  */
  fabPanelWidth: { min: 240, max: 640 },
  councilNavWidth: { min: 200, max: 420 },
  councilConfigWidth: { min: 240, max: 480 },
} as const;

/**
 * How much of the window the FAB panel may take, dragged all the way out.
 *
 * The one pane bound in the app expressed as a share rather than a pixel count.
 * Every other pane holds a list whose rows have a natural width, so an absolute
 * ceiling is the right answer for them; this one holds documents, chat and loop
 * output, which want as much of the window as the user will part with — and
 * what "as much as you can spare" is in pixels depends entirely on the display.
 */
export const FAB_PANEL_MAX_SHARE = 0.6;

/**
 * The strip of the view a dragged terminal may never cover, in px.
 *
 * The terminal's `LAYOUT_BOUNDS.terminalHeight.max` is a floor for this rather
 * than the real ceiling: the panel drags to the full height of the column
 * minus this, so on a tall window it goes far past 720. The remaining strip is
 * what keeps a plain drag distinguishable from maximizing — cross it and the
 * splitter snaps to maximized instead, which is a different, reversible state
 * with its own restore button rather than a height that happens to be tall.
 */
export const TERMINAL_VIEW_RESERVE = 88;


export const GRAPH_COLUMN_BOUNDS = {
  branchTag: { min: 100, max: 400 },
  author: { min: 80, max: 320 },
  date: { min: 72, max: 240 },
  sha: { min: 56, max: 160 },
  // The gutter has no entry: both its bounds are geometry — the natural fit of
  // the loaded history and the point past which its lanes stop being separable
  // — so they are computed per render in `GraphView` and handed to
  // `useGraphColumns`. A constant pair here would be a second answer to a
  // question that already has one.
} as const;

/**
 * UI state: what's selected, what's open, how the panes are sized.
 *
 * Deliberately separate from TanStack Query (which owns main-process data) and
 * from the graph store (which owns streamed rows): this is the state that
 * belongs to the window, survives no refetch, and is written from event
 * handlers all over the tree.
 *
 * Persisted selectively — see `partialize` below.
 */
export type UiState = {
  activeView: ViewId;
  /**
   * Browser-style back/forward stack over `activeView`, for the title bar's
   * history buttons — session-only, like `activeView` itself, so a restart
   * does not hand the user a "back" button to a view from last time.
   *
   * An array + cursor rather than two stacks: `goBack`/`goForward` just move
   * the cursor, and `setActiveView` truncates everything past it before
   * pushing — the same shape `window.history` uses, and it is what makes
   * "go back twice, then navigate somewhere new" drop the old forward branch
   * instead of leaving it dangling.
   */
  viewHistory: ViewId[];
  viewHistoryIndex: number;
  /** Which settings page is showing. A preference — reopening Settings should
   *  land where you last were, so it persists. */
  settingsPage: SettingsPageId;
  selectedRepoId: string | null;
  selectedWorktreePath: string | null;
  /**
   * What the graph's detail panel shows — a commit or a stash entry, never
   * both. A discriminated union rather than two independent nullable fields
   * (Phase 22 Theme D): two fields can both be non-null at once, which is a
   * state nothing renders correctly, and the panel would have to invent a
   * tie-break rule for which one wins. One field with a `kind` tag makes that
   * state unrepresentable instead.
   */
  graphSelection: GraphSelection;
  /**
   * Whether the repositories sidebar is shown at all.
   *
   * Distinct from `sectionFilters`, which narrows what the panel LISTS: this is
   * the panel's existence, and the two compose — a narrowed panel can still be
   * hidden outright to give the graph the full window.
   *
   * Open by default. It is the app's primary object list, and a fresh install
   * that started with no repository picker would look broken.
   */
  reposOpen: boolean;
  terminalOpen: boolean;
  /** Terminal fills everything below the title bar, hiding the graph. */
  terminalMaximized: boolean;
  /** Which edge of the terminal pane the session list docks to. */
  terminalSidebarSide: TerminalSidebarSide;
  /**
   * Whether the session list is shown beside the active terminal.
   *
   * Still only rendered past one session — a list of one names nothing the
   * header does not — so this is the second half of that condition rather
   * than a replacement for it.
   */
  terminalListOpen: boolean;
  /**
   * Whether the browser pane covers the content row.
   *
   * A flat boolean like `reposOpen`/`terminalOpen`, not a per-repo flag: the
   * pane holds no per-repo state (no engine, nothing loaded) to protect, so
   * there is nothing for a repo switch to disagree about.
   */
  browserOpen: boolean;
  /** Whether the FAB panel is open. */
  fabPanelOpen: boolean;
  /** Active tab in the FAB panel. */
  activeFabTab: FabTab;
  /**
   * The terminal session each FAB tab currently owns (Phase 35), keyed by tab
   * id. Persisted so a relaunch reattaches each tab to its own (asleep)
   * session — the session rows themselves live in `terminals.json`; this is
   * just the tab → session pairing only the renderer knows.
   */
  fabSessions: Record<string, string>;
  setFabSession: (tab: FabTab, sessionId: string | undefined) => void;
  /**
   * The session a tab has just superseded — at most one per tab.
   *
   * Start always begins a *fresh* run, but killing the predecessor at that
   * instant would yank the transcript out from under whoever is reading it.
   * So the outgoing session lingers here, invisible to every surface, and is
   * closed when the tab is switched away from. One slot per tab caps the
   * lingering at four sessions, so `terminals.json` cannot grow without
   * bound the way an unpruned list would.
   *
   * NOT persisted: a parked session is a courtesy to whoever is mid-read, and
   * that reader is gone by the next launch. Persisting it only rehydrated a
   * hidden dead session that nothing would collect until you happened to
   * switch tabs.
   */
  fabPrevSessions: Record<string, string>;
  setFabPrevSession: (tab: FabTab, sessionId: string | undefined) => void;
  /**
   * Which of a loop's composer checkboxes a *fresh* run starts with, keyed
   * loopId → modifierId. This is the user-editable half (Settings ▸ Agent ▸
   * Loops) and the only half that persists; an absent entry falls back to the
   * modifier's own declared `defaultOn`.
   *
   * The boxes a run actually carries are ephemeral to the tab — see
   * {@link loopModifierChecks} — so tweaking one run never silently rewrites
   * what the next one starts from.
   */
  loopModifierDefaults: Record<string, Record<string, boolean>>;
  setLoopModifierDefault: (loopId: string, modifierId: string, on: boolean) => void;
  /**
   * The per-run checkbox state, seeded from {@link loopModifierDefaults} on
   * first read. Deliberately NOT persisted: a loop you ran once with
   * `--triage-only` should not quietly stay in triage mode next week. It
   * survives the panel closing (the store outlives the component) and dies
   * with the window, which is what "ephemeral to the tab" means here.
   */
  loopModifierChecks: Record<string, Record<string, boolean>>;
  setLoopModifierCheck: (loopId: string, modifierId: string, on: boolean) => void;
  /**
   * Which radio a loop's one-of-N settings sit on, keyed loopId → choiceId →
   * optionId. Persisted, and with no ephemeral twin: a radio has no "off", so
   * an unpersisted one would snap back to its declared default every launch
   * and quietly change what the loop is told. An id naming no option resolves
   * to the default (`resolveLoopChoice`) rather than leaving the group blank.
   */
  loopChoices: Record<string, Record<string, string>>;
  setLoopChoice: (loopId: string, choiceId: string, optionId: string) => void;
  /**
   * Which Claude each loop runs on. Persisted for the same reason as the
   * radios above, and for one more: a model is a cost decision, and one made
   * on Monday should still hold on Tuesday.
   */
  loopModels: Record<string, LoopModel>;
  setLoopModel: (loopId: string, model: LoopModel) => void;
  /**
   * The working window each loop is told to keep. Persisted — "only work
   * office hours" is a standing preference, not a property of one run.
   */
  loopSchedules: Record<string, LoopSchedule>;
  setLoopSchedule: (loopId: string, schedule: LoopSchedule) => void;
  /** Per-loop free-text extras — ephemeral, on the same reasoning as above. */
  loopExtras: Record<string, string>;
  setLoopExtras: (loopId: string, text: string) => void;
  updatesAutoCheck: boolean;
  updateChannel: 'stable' | 'beta';
  onboardedAt: string | null;
  occluders: number;
  incrementOccluders: () => void;
  decrementOccluders: () => void;
  setUpdatesAutoCheck: (autoCheck: boolean) => void;
  setUpdateChannel: (channel: 'stable' | 'beta') => void;
  setOnboardedAt: (timestamp: string | null) => void;
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  /** Councils' right configuration panel, collapsed to a rail (Phase 42 Theme B). */
  councilConfigCollapsed: boolean;
  setCouncilConfigCollapsed: (collapsed: boolean) => void;

  layout: LayoutSizes;
  graphColumns: GraphColumns;
  navMode: NavMode;
  collapsedNavSections: string[];
  /**
   * Which settings categories the user has folded shut, by `SettingsGroupId`.
   *
   * A list of the collapsed ones rather than a record of every group's state,
   * so a category added later starts open without a migration — the same
   * inversion `collapsedNavSections` uses for the nav rail.
   */
  collapsedSettingsGroups: string[];
  /**
   * Which of a repo's sidebar sections are folded shut, by repo id.
   *
   * Same closed-set inversion as `collapsedNavSections`, one level down: a
   * section added later starts open with no migration, and a repo opened for
   * the first time has no entry at all rather than an explicit empty one —
   * that's what lets {@link pruneRepoSections} tell "closed everything" apart
   * from "never had an opinion".
   *
   * The value type is `string[]`, not `SectionKey[]`: `RemoteGroup`'s own fold
   * state joins this map too, under a composite `remotes:<name>` key that is
   * not a member of `SectionKey`. Callers that only ever pass a real
   * `SectionKey` get that guarantee from `toggleRepoSection` in
   * `features/repos/view-sections.ts`, which wraps the untyped
   * {@link toggleRepoSectionKey} below — kept here rather than typed against
   * `SectionKey` directly because `view-sections.ts` already imports from this
   * store, and the reverse import would cycle.
   */
  collapsedRepoSections: Record<string, string[]>;
  /**
   * Per-view override of whether the repositories sidebar is narrowed to what
   * the view is about — the "Show all sections" escape hatch.
   *
   * A sparse map, not a full record: an absent entry means "whatever this view
   * does by default" (see `features/repos/view-sections.ts`), so a view added
   * later starts from its own default rather than from a stale `false` written
   * before it existed.
   *
   * Keyed by view because the answer is per-view. Filtering Actions down to its
   * two sections and then wanting the whole tree in Changes are unrelated
   * decisions, and one flag for both would make each undo the other.
   */
  sectionFilters: Partial<Record<ViewId, boolean>>;
  /** Ordered list of user-created repo groups. */
  repoGroups: RepoGroup[];
  /**
   * Maps each repo id to the group it belongs to.
   *
   * A repo absent from this map is ungrouped — it renders in the flat list
   * above the groups, which is the default for every repo the user has opened.
   */
  repoGroupMembership: Record<string, string>;
  /** Group ids that are collapsed (same closed-set inversion as repo folds). */
  collapsedRepoGroups: string[];
  /** Which of the graph styles is drawn. A preference, so it persists. */
  graphTheme: GraphThemeId;
  /**
   * How much vertical room a commit row takes.
   *
   * A second axis rather than five more styles: "which graph do I like" and
   * "how much history fits on this screen" are different questions, and the
   * answer to the second changes with the display rather than with taste.
   */
  graphDensity: GraphDensity;
  /** Fully-qualified refs the graph is limited to; empty means every ref. */
  graphRefFilter: string[];
  /** Lowercased author emails to highlight; empty means every author. */
  graphAuthorFilter: string[];
  /**
   * Show the pre-image line-number column in a diff.
   *
   * Off by default: the inspector is a side panel, and two monospace gutters
   * eat width that the code itself needs. On when the user wants to answer
   * "which line is this in HEAD".
   */
  diffShowOldGutter: boolean;
  /** Layout preference for diff rendering: unified (single column) or split (side-by-side) */
  diffLayout: 'unified' | 'split';
  setDiffLayout: (layout: 'unified' | 'split') => void;
  toggleDiffLayout: () => void;

  /**
   * How the commit inspector lists a commit's files.
   *
   * A preference, not a per-commit choice: whichever of "where does this live"
   * and "what actually moved" you are asking, you tend to keep asking it. So it
   * persists, and it survives a repo switch.
   */
  commitFileView: CommitFileView;
  /**
   * Is the commit inspector's metadata accordion open?
   *
   * Open by default — the author, the message and the parents are what the
   * inspector is for. Closed, the panel is a file list over a full-height diff,
   * which is the shape you want once you are reading the change rather than
   * the commit. Persisted for the same reason `commitFileView` is: it tracks
   * which of those two jobs you are doing, and that does not change per commit.
   */
  commitMetaOpen: boolean;
  /**
   * How the Changes panel lists a checkout's files.
   *
   * Its own preference rather than a share of `commitFileView`: the questions
   * differ. A commit's list answers "what moved"; the Changes panel's answers
   * "what do I stage next", which is a question about where files live far more
   * often than about how big they are.
   */
  changesFileView: CommitFileView;

  setActiveView: (view: ViewId) => void;
  /** Step the view history back one entry; a no-op at its start. */
  goBack: () => void;
  /** Step the view history forward one entry; a no-op at its end. */
  goForward: () => void;
  setSettingsPage: (page: SettingsPageId) => void;
  selectRepo: (repoId: string | null) => void;
  selectWorktree: (path: string | null) => void;
  selectCommit: (sha: string | null) => void;
  /** Select a stash entry — clears any commit selection (Phase 22 Theme D). */
  selectStash: (selector: string | null) => void;
  toggleRepos: () => void;
  setReposOpen: (open: boolean) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminalMaximized: () => void;
  setTerminalMaximized: (maximized: boolean) => void;
  toggleTerminalHalfMaximized: () => void;
  setTerminalSidebarSide: (side: TerminalSidebarSide) => void;
  toggleTerminalList: () => void;
  toggleBrowser: () => void;
  setBrowserOpen: (open: boolean) => void;
  toggleFabPanel: () => void;
  setFabPanelOpen: (open: boolean) => void;
  setActiveFabTab: (tab: FabTab) => void;
  onFabTabClick: (tab: FabTab) => void;
  /**
   * Open the panel *on* a tab, in one action — what a "loop is waiting"
   * notification does when it is clicked. Two separate setters would render
   * an intermediate frame on whichever tab was last active.
   */
  openFabTab: (tab: FabTab) => void;

  setLayout: <K extends keyof LayoutSizes>(key: K, value: number) => void;
  setGraphColumn: <K extends keyof GraphColumns>(key: K, value: number) => void;
  setNavMode: (mode: NavMode) => void;
  toggleSettingsGroup: (key: SettingsGroupId) => void;
  toggleNavSection: (key: string) => void;
  /**
   * The untyped primitive: any string key, for `RemoteGroup`'s composite
   * `remotes:<name>` keys as well as real `SectionKey`s. Prefer
   * `toggleRepoSection` (`features/repos/view-sections.ts`) at a normal
   * `SectionKey` call site — this exists for the one caller that cannot use it.
   */
  toggleRepoSectionKey: (repoId: string, key: string) => void;
  /** Drops a repo's entry entirely once it leaves the workspace. */
  pruneRepoSections: (repoId: string) => void;
  /** Flip one view's sidebar between "what this view needs" and the whole tree. */
  setSectionFilter: (view: ViewId, filtered: boolean) => void;
  /**
   * Drop every per-view override, returning each view to its own default.
   *
   * Empties the map rather than writing each view's default back as an explicit
   * entry: an absent entry means "whatever this view does by default", so a
   * view whose default changes in a later release follows it — a written-out
   * default would freeze today's answer forever.
   */
  resetSectionFilters: () => void;
  createRepoGroup: (name: string) => string;
  renameRepoGroup: (groupId: string, name: string) => void;
  setRepoGroupColor: (groupId: string, color?: string) => void;
  deleteRepoGroup: (groupId: string) => void;
  reorderRepoGroups: (ids: string[]) => void;
  assignRepoToGroup: (repoId: string, groupId: string) => void;
  removeRepoFromGroup: (repoId: string) => void;
  toggleRepoGroup: (groupId: string) => void;
  setGraphTheme: (theme: GraphThemeId) => void;
  setGraphDensity: (density: GraphDensity) => void;
  setGraphRefFilter: (refs: string[]) => void;
  setGraphAuthorFilter: (emails: string[]) => void;
  toggleDiffOldGutter: () => void;
  setCommitFileView: (view: CommitFileView) => void;
  toggleCommitMeta: () => void;
  setChangesFileView: (view: CommitFileView) => void;
  /**
   * Metrics the user has turned OFF in the footer (Phase 18 F).
   *
   * Stored as the hidden set rather than the shown one so a metric added in a
   * later release appears by default — an allowlist persisted before it
   * existed would silently hide it for every existing user, which is the
   * failure mode nobody notices because nothing is broken, only absent.
   */
  hiddenMetrics: MetricId[];
  toggleMetric: (id: MetricId) => void;

  autoFetchIntervalMs: number | null;
  setAutoFetchIntervalMs: (ms: number | null) => void;
  /** Sampling cadence with the flyout closed. Opening it always escalates. */
  metricsIdleIntervalMs: number;
  setMetricsIdleInterval: (ms: number) => void;
  /**
   * Whether the Reviews view may act on a pull request (Phase 20 Themes F/G).
   *
   * Off until a human turns it on, in Settings → Reviews. One machine-wide
   * switch, deliberately NOT Phase 18's per-repository trust prompt, and the
   * difference is what is being consented to: running a repo's own linter
   * executes arbitrary code that repository chose, so consent for one says
   * nothing about another. Nothing behind this flag executes anyone's code — it
   * calls the user's own already-authenticated `gh`, against a repository they
   * opened, doing things they could equally type into a terminal.
   *
   * So this is a guard against the accidental click and a place to see in one
   * screen what the app may change on your behalf — not a security boundary,
   * and the page says so rather than implying a protection it does not give.
   *
   * The gate lives at the controls rather than inside the mutations: a disabled
   * button whose tooltip names the setting is somewhere to go, while a mutation
   * that silently refused would be a dead click with nothing to read.
   */
  forgeWritesEnabled: boolean;
  setForgeWritesEnabled: (enabled: boolean) => void;
  /**
   * The last ProjectV2 board opened per repo (Phase 40 Theme D).
   *
   * A top-level persisted key, like `repoGroupMembership`, rather than nested
   * under `layout` — it is not a pane size, and the Projects view's board
   * picker reads it directly by `repoId`. A repo with no entry has simply
   * never had a board picked, which the view reads as "show the picker".
   */
  projectBoardByRepo: Record<string, string>;
  setProjectBoard: (repoId: string, projectId: string) => void;
  /**
   * Table or board, per repo (Phase 41 Theme A).
   *
   * The board is a *mode* inside the Projects view, not a route — `ViewId`
   * and `FORGE_GATED_VIEWS` change nothing — so this lives beside
   * `projectBoardByRepo` rather than under `layout`, for the same reason:
   * it is per-repo view state, not a pane size. A repo with no entry reads
   * as `'table'`, the phase's existing default.
   */
  projectsMode: Record<string, 'table' | 'board'>;
  setProjectsMode: (repoId: string, mode: 'table' | 'board') => void;
  /**
   * Which skill each entry of the sidebar's midnite menu invokes.
   *
   * A setting rather than a constant because a skill is a *file in the user's
   * `~/.claude`* (or its `.agents`/`.codex` siblings)*, not something this app
   * ships: `/midnite-exec`, `/midnite-brainstorm`, `/midnite-refine`,
   * `/midnite-release-prep` and `/midnite-release-complete` are this
   * repository's own project skills, `/loop-pr-reviews` and `/loop-pr-feedback`
   * are personal commands, and `/loop /midnite-exec` / `/loop /midnite-brainstorm`
   * wrap the generic `/loop` skill around two of the entries above — any of
   * them can be renamed, forked or replaced without the app knowing.
   * Hard-coding them would make the menu silently open a terminal on a command
   * that no longer exists.
   *
   * The values are whole prompts, not bare skill names, so a caller can point
   * an entry at anything the agent accepts — `/midnite-exec`,
   * `/midnite-exec --dry-run`, or a plain sentence — and the menu keeps
   * working. Stored with the Claude/Antigravity `/name` prefix; when
   * {@link primaryAgent} is Codex, `startAgent` (`features/terminal/
   * start-agent.ts`) rewrites the leading `/` of each token to Codex's `$name`
   * convention before typing it in — the setting itself never needs to know.
   */
  agentSkills: Record<AgentCommandId, string>;
  setAgentSkill: (id: AgentCommandId, skill: string) => void;
  /**
   * The agent the midnite menu launches — an id from the roster
   * (`BUILTIN_AGENTS` in `@midnite/studio-shared`, e.g. `'claude'`, `'agy'`,
   * `'codex'`), not a closed union: the roster is user-extensible via
   * `agents.json`, and this setting just names one of its entries.
   */
  primaryAgent: string;
  setPrimaryAgent: (id: string) => void;

  inactivityTimeoutS: number;
  setInactivityTimeout: (seconds: number) => void;
  cycleDurationS: number;
  setCycleDuration: (seconds: number) => void;
  requirePasscode: boolean;
  setRequirePasscode: (require: boolean) => void;
  /**
   * Phase 22 Theme F's opt-in — same shape as `forgeWritesEnabled` (Phase 20):
   * default off, so a fresh install cannot force-push anything until someone
   * deliberately turns it on. The ref badge menu's force-with-lease entry
   * checks this before it will even offer the item.
   */
  allowForceWithLease: boolean;
  setAllowForceWithLease: (allow: boolean) => void;
  passcode: string | null;
  setPasscode: (code: string | null) => void;
  passcodeOnlyWhenLocked: boolean;
  setPasscodeOnlyWhenLocked: (onlyWhenLocked: boolean) => void;

  screensaverOpen: boolean;
  screensaverLocked: boolean;
  setScreensaverOpen: (open: boolean, locked?: boolean) => void;
  lockScreen: () => void;
};

/**
 * The verbs the sidebar's midnite menu offers, grouped into the menu's three
 * categories: agent tasks, release tasks, then loops.
 *
 * Ids, not labels or glyphs: those live with the menu in
 * `features/agent/agent-commands.ts`, the same split `SETTINGS_PAGES` and
 * `PAGE_ICON` already use, so this file stays a plain data module that pulls no
 * icon package in behind it. The ids are also the persisted keys, so they stay
 * put while the labels the menu shows are free to be reworded.
 */
export type AgentCommandId =
  | 'execBacklog'
  | 'execAdhoc'
  | 'addressIssue'
  | 'brainstorm'
  | 'refine'
  | 'prReview'
  | 'prFeedback'
  | 'releasePrep'
  | 'releaseComplete'
  | 'gitReport'
  | 'gitCleanup'
  | 'loopPatrol'
  | 'loopPrReview'
  | 'loopPrFeedback'
  | 'loopExecBacklog'
  | 'loopExecAdhoc'
  | 'loopAddressIssue'
  | 'loopBrainstorm';

/**
 * A user-created group in the repositories sidebar.
 *
 * The group lives in `repoGroups`; which repos belong to it is recorded by
 * adding the repo id to `repoGroupMembership`. That split keeps the membership
 * map cheap to update (one key per repo rather than rewriting the whole groups
 * array every time a repo is added) and lets the panel quickly ask "which group
 * is repo X in?" without scanning every group.
 */
export type RepoGroup = {
  /** Stable UUID, never re-used. */
  id: string;
  name: string;
  color?: string;
};

/**
 * What each entry invokes out of the box — the skills this repo and its author
 * actually have. Settings → Agent can point any of them somewhere else.
 */
export const DEFAULT_AGENT_SKILLS: Record<AgentCommandId, string> = {
  execBacklog: '/midnite-exec',
  execAdhoc: '/midnite-exec-adhoc',
  addressIssue: '/midnite-address-issue',
  brainstorm: '/midnite-brainstorm',
  refine: '/midnite-refine',
  prReview: '/pr-review',
  prFeedback: '/pr-feedback',
  releasePrep: '/midnite-release-prep',
  releaseComplete: '/midnite-release-complete',
  gitReport: '/midnite-git-report',
  gitCleanup: '/midnite-git-cleanup',
  // Bare on purpose: the FAB's Patrol tab appends `/pr-review`, `/pr-feedback`
  // or `/midnite-triage` from its own checkboxes, so a skill named here would
  // be a fifth one every run carried whether or not a box was ticked.
  loopPatrol: '/loop',
  loopPrReview: '/loop /pr-review',
  loopPrFeedback: '/loop /pr-feedback',
  loopExecBacklog: '/loop /midnite-exec',
  loopExecAdhoc: '/loop /midnite-exec-adhoc',
  loopAddressIssue: '/loop /midnite-address-issue',
  loopBrainstorm: '/loop /midnite-brainstorm',
};

/**
 * The slice that reaches localStorage — the return type `partialize` produces
 * and `migrate` must therefore also produce. Named so the two cannot drift.
 */
type PersistedUi = Pick<
  UiState,
  | 'layout'
  | 'graphColumns'
  | 'navMode'
  | 'collapsedNavSections'
  | 'collapsedSettingsGroups'
  | 'collapsedRepoSections'
  | 'sectionFilters'
  | 'diffShowOldGutter'
  | 'diffLayout'
  | 'graphTheme'
  | 'selectedRepoId'
  | 'selectedWorktreePath'
  | 'graphDensity'
  | 'settingsPage'
  | 'commitFileView'
  | 'commitMetaOpen'
  | 'changesFileView'
  | 'reposOpen'
  | 'terminalOpen'
  | 'terminalMaximized'
  | 'terminalSidebarSide'
  | 'terminalListOpen'
  | 'browserOpen'
  | 'fabPanelOpen'
  | 'fabSessions'
  | 'loopModifierDefaults'
  | 'loopChoices'
  | 'loopModels'
  | 'loopSchedules'
  | 'hiddenMetrics'
  | 'autoFetchIntervalMs'
  | 'metricsIdleIntervalMs'
  | 'forgeWritesEnabled'
  | 'projectBoardByRepo'
  | 'projectsMode'
  | 'agentSkills'
  | 'primaryAgent'
  | 'repoGroups'
  | 'repoGroupMembership'
  | 'collapsedRepoGroups'
  | 'updatesAutoCheck'
  | 'updateChannel'
  | 'onboardedAt'
  | 'showOnboarding'
  | 'councilConfigCollapsed'
  | 'inactivityTimeoutS'
  | 'cycleDurationS'
  | 'requirePasscode'
  | 'passcode'
  | 'passcodeOnlyWhenLocked'
  | 'allowForceWithLease'
>;

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.ui', 'midnite-studio.ui');

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeView: 'graph',
      viewHistory: ['graph'],
      viewHistoryIndex: 0,
      settingsPage: 'appearance',
      hiddenMetrics: [],
      autoFetchIntervalMs: 60000,
      metricsIdleIntervalMs: METRICS_IDLE_INTERVAL_MS,
      // Default off. A fresh install cannot change anything on GitHub.
      forgeWritesEnabled: false,
      projectBoardByRepo: {},
      projectsMode: {},
      agentSkills: DEFAULT_AGENT_SKILLS,
      primaryAgent: 'claude',
      inactivityTimeoutS: 900,
      setInactivityTimeout: (inactivityTimeoutS) => set({ inactivityTimeoutS }),
      cycleDurationS: 10,
      setCycleDuration: (cycleDurationS) => set({ cycleDurationS }),
      requirePasscode: false,
      setRequirePasscode: (requirePasscode) => set({ requirePasscode }),
      // Default off, same as forgeWritesEnabled: a fresh install cannot
      // force-push anything until someone deliberately turns it on.
      allowForceWithLease: false,
      setAllowForceWithLease: (allowForceWithLease) => set({ allowForceWithLease }),
      passcode: null,
      setPasscode: (passcode) => set({ passcode }),
      passcodeOnlyWhenLocked: false,
      setPasscodeOnlyWhenLocked: (passcodeOnlyWhenLocked) => set({ passcodeOnlyWhenLocked }),
      screensaverOpen: false,
      screensaverLocked: false,
      setScreensaverOpen: (screensaverOpen, screensaverLocked = false) =>
        set({ screensaverOpen, screensaverLocked }),
      lockScreen: () => set({ screensaverOpen: true, screensaverLocked: true }),
      selectedRepoId: null,
      selectedWorktreePath: null,
      graphSelection: null,
      reposOpen: true,
      terminalOpen: false,
      terminalMaximized: false,
      terminalSidebarSide: 'right',
      terminalListOpen: true,
      browserOpen: false,
      fabPanelOpen: false,
      activeFabTab: 'innovate',
      fabSessions: {},
      setFabSession: (tab, sessionId) =>
        set((state) => {
          const next = { ...state.fabSessions };
          if (sessionId === undefined) delete next[tab];
          else next[tab] = sessionId;
          return { fabSessions: next };
        }),
      fabPrevSessions: {},
      setFabPrevSession: (tab, sessionId) =>
        set((state) => {
          const next = { ...state.fabPrevSessions };
          if (sessionId === undefined) delete next[tab];
          else next[tab] = sessionId;
          return { fabPrevSessions: next };
        }),
      loopModifierDefaults: {},
      setLoopModifierDefault: (loopId, modifierId, on) =>
        set((state) => ({
          loopModifierDefaults: {
            ...state.loopModifierDefaults,
            [loopId]: { ...state.loopModifierDefaults[loopId], [modifierId]: on },
          },
        })),
      loopModifierChecks: {},
      setLoopModifierCheck: (loopId, modifierId, on) =>
        set((state) => ({
          loopModifierChecks: {
            ...state.loopModifierChecks,
            [loopId]: { ...state.loopModifierChecks[loopId], [modifierId]: on },
          },
        })),
      loopChoices: {},
      setLoopChoice: (loopId, choiceId, optionId) =>
        set((state) => ({
          loopChoices: {
            ...state.loopChoices,
            [loopId]: { ...state.loopChoices[loopId], [choiceId]: optionId },
          },
        })),
      loopModels: {},
      setLoopModel: (loopId, model) =>
        set((state) => ({ loopModels: { ...state.loopModels, [loopId]: model } })),
      loopSchedules: {},
      setLoopSchedule: (loopId, schedule) =>
        set((state) => ({ loopSchedules: { ...state.loopSchedules, [loopId]: schedule } })),
      loopExtras: {},
      setLoopExtras: (loopId, text) =>
        set((state) => ({ loopExtras: { ...state.loopExtras, [loopId]: text } })),
      updatesAutoCheck: true,
      updateChannel: 'stable',
      onboardedAt: null,
      occluders: 0,
      incrementOccluders: () => set((s) => ({ occluders: s.occluders + 1 })),
      decrementOccluders: () => set((s) => ({ occluders: Math.max(0, s.occluders - 1) })),
      setUpdatesAutoCheck: (updatesAutoCheck) => set({ updatesAutoCheck }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setOnboardedAt: (onboardedAt) => set({ onboardedAt }),
      showOnboarding: true,
      setShowOnboarding: (showOnboarding) => set({ showOnboarding }),
      councilConfigCollapsed: false,
      setCouncilConfigCollapsed: (councilConfigCollapsed) => set({ councilConfigCollapsed }),

      layout: DEFAULT_LAYOUT,
      graphColumns: DEFAULT_GRAPH_COLUMNS,
      navMode: 'auto',
      collapsedNavSections: [],
      collapsedSettingsGroups: [],
      collapsedRepoSections: {},
      sectionFilters: {},
      repoGroups: [],
      repoGroupMembership: {},
      collapsedRepoGroups: [],
      graphTheme: DEFAULT_GRAPH_THEME,
      graphDensity: DEFAULT_GRAPH_DENSITY,
      graphRefFilter: [],
      graphAuthorFilter: [],
      diffShowOldGutter: false,
      diffLayout: 'unified',

      commitFileView: 'tree',
      commitMetaOpen: true,
      changesFileView: 'list',

      // Guarded: leaving Files with an unsaved edit open waits on the editor's
      // own Save/Discard/Cancel dialog rather than losing the edit silently.
      //
      // De-maximises the terminal when navigating: a maximised terminal covers
      // the entire content area, so any view switch that leaves it maximised
      // would land on a blank screen. The terminal stays open (visible as the
      // normal-height panel) so the session is not disrupted — only the
      // fullscreen state is cleared.
      setActiveView: (view) =>
        useFileEditorStore.getState().guardNavigation(() =>
          set((state) => {
            if (view === state.activeView) return {};
            const viewHistory = [...state.viewHistory.slice(0, state.viewHistoryIndex + 1), view];
            return {
              activeView: view,
              viewHistory,
              viewHistoryIndex: viewHistory.length - 1,
              ...(state.terminalMaximized ? { terminalMaximized: false } : {}),
            };
          }),
        ),
      // The title bar's Back/Forward buttons change `activeView` exactly like
      // `setActiveView` does, so they carry the same guard.
      goBack: () =>
        useFileEditorStore.getState().guardNavigation(() =>
          set((state) => {
            if (state.viewHistoryIndex <= 0) return {};
            const viewHistoryIndex = state.viewHistoryIndex - 1;
            return { activeView: state.viewHistory[viewHistoryIndex], viewHistoryIndex };
          }),
        ),
      goForward: () =>
        useFileEditorStore.getState().guardNavigation(() =>
          set((state) => {
            if (state.viewHistoryIndex >= state.viewHistory.length - 1) return {};
            const viewHistoryIndex = state.viewHistoryIndex + 1;
            return { activeView: state.viewHistory[viewHistoryIndex], viewHistoryIndex };
          }),
        ),
      setSettingsPage: (settingsPage) => set({ settingsPage }),
      // Switching repo invalidates every selection scoped to the old one — the
      // ref filter included: refs are per-repo, so carrying `refs/heads/feat-x`
      // into a repo that has no such branch yields an empty graph that looks
      // like missing history.
      selectRepo: (selectedRepoId) =>
        useFileEditorStore.getState().guardNavigation(() =>
          set({
            selectedRepoId,
            selectedWorktreePath: null,
            graphSelection: null,
            graphRefFilter: [],
            graphAuthorFilter: [],
          }),
        ),
      selectWorktree: (selectedWorktreePath) =>
        useFileEditorStore.getState().guardNavigation(() => set({ selectedWorktreePath })),
      selectCommit: (sha) => set({ graphSelection: sha === null ? null : { kind: 'commit', sha } }),
      selectStash: (selector) =>
        set({ graphSelection: selector === null ? null : { kind: 'stash', selector } }),
      toggleRepos: () => set((state) => ({ reposOpen: !state.reposOpen })),
      setReposOpen: (reposOpen) => set({ reposOpen }),
      toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
      setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
      toggleTerminalMaximized: () =>
        set((state) => ({ terminalMaximized: !state.terminalMaximized })),
      setTerminalMaximized: (terminalMaximized) => set({ terminalMaximized }),
      toggleTerminalHalfMaximized: () =>
        set((state) => {
          if (!state.terminalOpen) {
            return { terminalOpen: true, terminalMaximized: false };
          }
          return { terminalMaximized: !state.terminalMaximized };
        }),
      setTerminalSidebarSide: (terminalSidebarSide) => set({ terminalSidebarSide }),
      toggleTerminalList: () =>
        set((state) => ({ terminalListOpen: !state.terminalListOpen })),
      toggleBrowser: () => set((state) => ({ browserOpen: !state.browserOpen })),
      setBrowserOpen: (browserOpen) => set({ browserOpen }),
      toggleFabPanel: () => set((state) => ({ fabPanelOpen: !state.fabPanelOpen })),
      setFabPanelOpen: (fabPanelOpen) => set({ fabPanelOpen }),
      setActiveFabTab: (activeFabTab) => set({ activeFabTab }),
      onFabTabClick: (tab) => {
        set((state) => {
          if (state.activeFabTab === tab) return {};
          // Switch to the tab; terminal session spawning happens in the terminal system
          return { activeFabTab: tab };
        });
      },
      openFabTab: (tab) => set({ fabPanelOpen: true, activeFabTab: tab }),
      setLayout: (key, value) => set((state) => ({ layout: { ...state.layout, [key]: value } })),
      setGraphColumn: (key, value) =>
        set((state) => ({ graphColumns: { ...state.graphColumns, [key]: value } })),
      setNavMode: (navMode) => set({ navMode }),
      toggleNavSection: (key) =>
        set((state) => ({
          collapsedNavSections: state.collapsedNavSections.includes(key)
            ? state.collapsedNavSections.filter((k) => k !== key)
            : [...state.collapsedNavSections, key],
        })),
      toggleSettingsGroup: (key) =>
        set((state) => ({
          collapsedSettingsGroups: state.collapsedSettingsGroups.includes(key)
            ? state.collapsedSettingsGroups.filter((k) => k !== key)
            : [...state.collapsedSettingsGroups, key],
        })),
      toggleRepoSectionKey: (repoId, key) =>
        set((state) => {
          const closed = state.collapsedRepoSections[repoId] ?? [];
          return {
            collapsedRepoSections: {
              ...state.collapsedRepoSections,
              [repoId]: closed.includes(key)
                ? closed.filter((k) => k !== key)
                : [...closed, key],
            },
          };
        }),
      pruneRepoSections: (repoId) =>
        set((state) => {
          if (!(repoId in state.collapsedRepoSections)) return {};
          const { [repoId]: _dropped, ...rest } = state.collapsedRepoSections;
          return { collapsedRepoSections: rest };
        }),
      setSectionFilter: (view, filtered) =>
        set((state) => ({ sectionFilters: { ...state.sectionFilters, [view]: filtered } })),
      resetSectionFilters: () => set({ sectionFilters: {} }),
      createRepoGroup: (name) => {
        const id = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({ repoGroups: [...state.repoGroups, { id, name }] }));
        return id;
      },
      renameRepoGroup: (groupId, name) =>
        set((state) => ({
          repoGroups: state.repoGroups.map((g) => (g.id === groupId ? { ...g, name } : g)),
        })),
      setRepoGroupColor: (groupId, color) =>
        set((state) => ({
          repoGroups: state.repoGroups.map((g) => (g.id === groupId ? { ...g, color } : g)),
        })),
      deleteRepoGroup: (groupId) =>
        set((state) => {
          const next: Record<string, string> = {};
          for (const [repoId, gid] of Object.entries(state.repoGroupMembership)) {
            if (gid !== groupId) next[repoId] = gid;
          }
          return {
            repoGroups: state.repoGroups.filter((g) => g.id !== groupId),
            repoGroupMembership: next,
            collapsedRepoGroups: state.collapsedRepoGroups.filter((id) => id !== groupId),
          };
        }),
      reorderRepoGroups: (ids) =>
        set((state) => ({
          repoGroups: ids
            .map((id) => state.repoGroups.find((g) => g.id === id))
            .filter((g): g is RepoGroup => g !== undefined),
        })),
      assignRepoToGroup: (repoId, groupId) =>
        set((state) => ({
          repoGroupMembership: { ...state.repoGroupMembership, [repoId]: groupId },
        })),
      removeRepoFromGroup: (repoId) =>
        set((state) => {
          const { [repoId]: _removed, ...rest } = state.repoGroupMembership;
          return { repoGroupMembership: rest };
        }),
      toggleRepoGroup: (groupId) =>
        set((state) => ({
          collapsedRepoGroups: state.collapsedRepoGroups.includes(groupId)
            ? state.collapsedRepoGroups.filter((id) => id !== groupId)
            : [...state.collapsedRepoGroups, groupId],
        })),
      setGraphTheme: (graphTheme) => set({ graphTheme }),
      setGraphDensity: (graphDensity) => set({ graphDensity }),
      setGraphRefFilter: (graphRefFilter) => set({ graphRefFilter }),
      setGraphAuthorFilter: (graphAuthorFilter) => set({ graphAuthorFilter }),
      toggleDiffOldGutter: () =>
        set((state) => ({ diffShowOldGutter: !state.diffShowOldGutter })),
      setDiffLayout: (diffLayout) => set({ diffLayout }),
      toggleDiffLayout: () =>
        set((state) => ({ diffLayout: state.diffLayout === 'split' ? 'unified' : 'split' })),

      setCommitFileView: (commitFileView) => set({ commitFileView }),
      toggleCommitMeta: () => set((state) => ({ commitMetaOpen: !state.commitMetaOpen })),
      setChangesFileView: (changesFileView) => set({ changesFileView }),
      toggleMetric: (id) =>
        set((state) => ({
          hiddenMetrics: state.hiddenMetrics.includes(id)
            ? state.hiddenMetrics.filter((entry) => entry !== id)
            : [...state.hiddenMetrics, id],
        })),
      setAutoFetchIntervalMs: (autoFetchIntervalMs) => set({ autoFetchIntervalMs }),
      setMetricsIdleInterval: (metricsIdleIntervalMs) => set({ metricsIdleIntervalMs }),
      setForgeWritesEnabled: (forgeWritesEnabled) => set({ forgeWritesEnabled }),
      setProjectBoard: (repoId, projectId) =>
        set((state) => ({
          projectBoardByRepo: { ...state.projectBoardByRepo, [repoId]: projectId },
        })),
      setProjectsMode: (repoId, mode) =>
        set((state) => ({ projectsMode: { ...state.projectsMode, [repoId]: mode } })),
      setAgentSkill: (id, skill) =>
        set((state) => ({ agentSkills: { ...state.agentSkills, [id]: skill } })),
      setPrimaryAgent: (id) => set({ primaryAgent: id }),
    }),
    {
      name: 'midnite-studio.ui',
      version: 5,
      partialize: (state): PersistedUi => ({
        layout: state.layout,
        graphColumns: state.graphColumns,
        navMode: state.navMode,
        collapsedNavSections: state.collapsedNavSections,
        collapsedSettingsGroups: state.collapsedSettingsGroups,
        collapsedRepoSections: state.collapsedRepoSections,
        sectionFilters: state.sectionFilters,
        diffShowOldGutter: state.diffShowOldGutter,
        diffLayout: state.diffLayout,
        graphTheme: state.graphTheme,
        selectedRepoId: state.selectedRepoId,
        selectedWorktreePath: state.selectedWorktreePath,
        graphDensity: state.graphDensity,
        settingsPage: state.settingsPage,
        commitFileView: state.commitFileView,
        commitMetaOpen: state.commitMetaOpen,
        changesFileView: state.changesFileView,
        reposOpen: state.reposOpen,
        terminalOpen: state.terminalOpen,
        terminalMaximized: state.terminalMaximized,
        terminalSidebarSide: state.terminalSidebarSide,
        terminalListOpen: state.terminalListOpen,
        browserOpen: state.browserOpen,
        fabPanelOpen: state.fabPanelOpen,
        fabSessions: state.fabSessions,
        loopModifierDefaults: state.loopModifierDefaults,
        loopChoices: state.loopChoices,
        loopModels: state.loopModels,
        loopSchedules: state.loopSchedules,
        hiddenMetrics: state.hiddenMetrics,
        autoFetchIntervalMs: state.autoFetchIntervalMs,
        metricsIdleIntervalMs: state.metricsIdleIntervalMs,
        forgeWritesEnabled: state.forgeWritesEnabled,
        projectBoardByRepo: state.projectBoardByRepo,
        projectsMode: state.projectsMode,
        agentSkills: state.agentSkills,
        primaryAgent: state.primaryAgent,
        repoGroups: state.repoGroups,
        repoGroupMembership: state.repoGroupMembership,
        collapsedRepoGroups: state.collapsedRepoGroups,
        updatesAutoCheck: state.updatesAutoCheck,
        updateChannel: state.updateChannel,
        onboardedAt: state.onboardedAt,
        /* Persisted for the same reason `onboardedAt` is: the welcome modal is
         * a full-screen `inset-0` overlay, so a default of `true` that is never
         * written down means it is re-raised over the whole app on every single
         * launch — and the only way past it is to dismiss it again. */
        showOnboarding: state.showOnboarding,
        councilConfigCollapsed: state.councilConfigCollapsed,
        inactivityTimeoutS: state.inactivityTimeoutS,
        cycleDurationS: state.cycleDurationS,
        requirePasscode: state.requirePasscode,
        passcode: state.passcode,
        passcodeOnlyWhenLocked: state.passcodeOnlyWhenLocked,
        allowForceWithLease: state.allowForceWithLease,
      }),

      /**
       * v1 → v2: drop the pre-Phase-14 `author` column width.
       * v2 → v3: supply `{}` for `collapsedRepoSections`.
       * v3 → v4: supply empty defaults for `repoGroups`.
       * v4 → v5: seed `updatesAutoCheck`, `updateChannel`, and set `onboardedAt` for existing installs.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown> & {
          graphColumns?: Record<string, number>;
          collapsedRepoSections?: Record<string, string[]>;
          repoGroups?: unknown[];
          repoGroupMembership?: Record<string, string>;
          collapsedRepoGroups?: string[];
          updatesAutoCheck?: boolean;
          updateChannel?: 'stable' | 'beta';
          onboardedAt?: string | null;
        };
        if (version < 2 && state.graphColumns) {
          const { author: _retired, ...rest } = state.graphColumns;
          state.graphColumns = rest;
        }
        if (version < 3) {
          state.collapsedRepoSections = {};
        }
        if (version < 4) {
          state.repoGroups = [];
          state.repoGroupMembership = {};
          state.collapsedRepoGroups = [];
        }
        if (version < 5) {
          state.updatesAutoCheck = true;
          state.updateChannel = 'stable';
          state.onboardedAt = new Date().toISOString();
        }
        return state as PersistedUi;
      },
      /**
       * Merge field-by-field over the defaults.
       *
       * zustand's default merge is a shallow spread, so a persisted `layout`
       * written before a new pane existed would replace the whole object and
       * leave that pane's size `undefined` — which reaches the DOM as
       * `width: undefined` and collapses the panel to zero. Re-spreading each
       * nested object means an older payload gains new keys instead.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...saved,
          layout: { ...current.layout, ...saved.layout },
          graphColumns: { ...current.graphColumns, ...saved.graphColumns },
          sectionFilters: { ...current.sectionFilters, ...saved.sectionFilters },
          /*
            Re-spread for the reason the comment above gives, and one more: a
            blob written before a later menu entry existed would otherwise
            replace the whole record and leave that entry's skill `undefined`,
            which reaches the terminal as the string "undefined".
          */
          agentSkills: { ...current.agentSkills, ...saved.agentSkills },
          fabSessions: { ...current.fabSessions, ...saved.fabSessions },
          loopModifierDefaults: {
            ...current.loopModifierDefaults,
            ...saved.loopModifierDefaults,
          },
          loopChoices: { ...current.loopChoices, ...saved.loopChoices },
          loopModels: { ...current.loopModels, ...saved.loopModels },
          loopSchedules: { ...current.loopSchedules, ...saved.loopSchedules },
          repoGroupMembership: { ...current.repoGroupMembership, ...saved.repoGroupMembership },
          projectBoardByRepo: { ...current.projectBoardByRepo, ...saved.projectBoardByRepo },
          projectsMode: { ...current.projectsMode, ...saved.projectsMode },
        };
      },
    },
  ),
);

/**
 * Route path for a view — AppFrame is router-agnostic and compares strings.
 *
 * `landing` is the one special case: it is the app's root, so it answers `/`
 * rather than `/landing`. `viewForPath` is derived from this function, so the
 * exception needs stating exactly once.
 */
export const pathForView = (view: ViewId): string => (view === 'landing' ? '/' : `/${view}`);

/**
 * The inverse of `pathForView`, over `VIEW_IDS` rather than a chain of
 * comparisons.
 *
 * The chain this replaced had to grow a branch per view and silently answered
 * `graph` for any it had not been taught — which for three new views would mean
 * three rail links that all looked like the graph. Deriving it from the union's
 * own list means a view cannot be added to `ViewId` and forgotten here.
 */
export const viewForPath = (path: string): ViewId =>
  VIEW_IDS.find((view) => pathForView(view) === path) ?? 'graph';
