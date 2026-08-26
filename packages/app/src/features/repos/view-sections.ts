import { useUiStore, type ViewId } from '../../store/ui-store';

/**
 * A section of a repository's subtree in the sidebar.
 *
 * `actions` and `reviews` are here even though `ForgeSections` renders them:
 * the point of one union is that "which sections does this view show" has a
 * single answer, and a forge section that decided its own visibility would be a
 * second one that could disagree.
 */
export type SectionKey =
  | 'local'
  | 'remotes'
  | 'tags'
  | 'worktrees'
  | 'actions'
  | 'reviews'
  | 'issues'
  | 'tests';

/**
 * The sections whose heading menu is built from a repo's refs.
 *
 * Narrower than `SectionKey` on purpose — `useRepoActions().sectionMenu` has
 * nothing to offer for a forge or test section, and widening its parameter to
 * the full union would replace a compile error with a menu that opens empty.
 */
export type RefSectionKey = 'local' | 'remotes' | 'tags' | 'worktrees';

/** Every section, in the order the tree renders them. */
export const ALL_SECTIONS: readonly SectionKey[] = [
  'local',
  'remotes',
  'tags',
  'worktrees',
  'actions',
  'reviews',
  'issues',
  'tests',
];

/**
 * What a view narrows the sidebar to while it is filtered.
 *
 * Two axes, because the sidebar has two: `sections` hides whole groups, and
 * `dirtyOnly` drops individual checkouts that have no uncommitted changes.
 * Phase 17's Changes filter was the first instance of exactly this idea and is
 * now just the `changes` row.
 */
export type ViewFilter = {
  sections: readonly SectionKey[];
  /** Hide clean checkouts — and repositories that have none that are dirty. */
  dirtyOnly: boolean;
};

/**
 * "Work in progress only": every ref section gone, the checkouts that have
 * changes kept. The Changes view's default, and what the toggle turns ON in a
 * view that has no narrowing of its own.
 */
const WORK_IN_PROGRESS: ViewFilter = { sections: ['worktrees'], dirtyOnly: true };

/**
 * The whole tree — what an unfiltered view shows, whichever view it is.
 *
 * Not in the table: it is the answer to "filtered = false", not to any view.
 */
export const UNFILTERED: ViewFilter = { sections: ALL_SECTIONS, dirtyOnly: false };

/**
 * What each view narrows to.
 *
 * Actions and Tests keep Worktrees beside their own section for the same
 * reason: which checkout you are asking about is the app's primary context in
 * every view, so removing it would make the view unable to say what its data is
 * about. Every other view narrows to work-in-progress, which is what the
 * sidebar's filter button has always meant.
 */
export const VIEW_FILTERS: Record<ViewId, ViewFilter> = {
  dashboard: WORK_IN_PROGRESS,
  files: WORK_IN_PROGRESS,
  graph: WORK_IN_PROGRESS,
  changes: WORK_IN_PROGRESS,
  actions: { sections: ['actions', 'worktrees'], dirtyOnly: false },
  tests: { sections: ['tests', 'worktrees'], dirtyOnly: false },
  settings: WORK_IN_PROGRESS,
};

/**
 * The views that arrive already narrowed.
 *
 * These are the views that ARE a question about a subset — work in progress, CI,
 * suites — so showing the full tree beside them answers a different one. Every
 * other view starts whole and can be narrowed by hand.
 */
export const filtersByDefault = (view: ViewId): boolean =>
  view === 'changes' || view === 'actions' || view === 'tests';

/** The effective filter for a view, given whether it is currently narrowed. */
export const filterFor = (view: ViewId, filtered: boolean): ViewFilter =>
  filtered ? VIEW_FILTERS[view] : UNFILTERED;

/**
 * What the sidebar shows in the active view, and the control that changes it.
 *
 * One hook rather than two because the two axes are one decision: "Show all
 * sections" has to put back the ref sections AND the clean checkouts, or the
 * escape hatch only half works.
 */
export type ViewSections = {
  /** Whether this section renders at all in the active view. */
  visible: (key: SectionKey) => boolean;
  /** Whether clean checkouts (and repositories with none dirty) are hidden. */
  dirtyOnly: boolean;
  /** Whether anything is being hidden — what the toggle's pressed state reads. */
  filtered: boolean;
  toggle: () => void;
};

export function useViewSections(): ViewSections {
  const view = useUiStore((s) => s.activeView);
  const override = useUiStore((s) => s.sectionFilters[s.activeView]);
  const setSectionFilter = useUiStore((s) => s.setSectionFilter);

  const filtered = override ?? filtersByDefault(view);
  const filter = filterFor(view, filtered);

  return {
    visible: (key) => filter.sections.includes(key),
    dirtyOnly: filter.dirtyOnly,
    filtered,
    toggle: () => setSectionFilter(view, !filtered),
  };
}
