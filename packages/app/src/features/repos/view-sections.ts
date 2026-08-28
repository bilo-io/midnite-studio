import { useUiStore, type ViewId } from '../../store/ui-store';

/**
 * The sidebar's section tree, end to end (Phase 28).
 *
 * `SECTION_TREE` below is the single ordered declaration of what the tree
 * renders and which node owns which. `RepoTree` (`repos-panel.tsx`) walks it
 * with one recursive `renderSection`, so a section this file does not
 * declare cannot appear in the sidebar by accident. The load-bearing rule is
 * `isVisibleIn`'s: a leaf is visible when the active view's filter admits
 * it; a parent is visible when the filter admits it **and** at least one
 * child is. `Branches` and `Forge` are the two parents today — they own
 * children and render a count, but have no data, no query and no empty
 * state that is not simply "every child is empty".
 *
 * `RefSectionKey` stayed narrower than `SectionKey`: it is only the sections
 * whose heading menu is built from a repo's refs, and a parent has no refs
 * of its own to offer one (see its own doc comment).
 *
 * **Adding a section** costs three edits, all made compile errors until
 * done by their `Record<SectionKey, …>` return type: a node in
 * `SECTION_TREE` below, a label in `SECTION_TITLE` and `SECTION_LABELS`
 * (`repos-panel.tsx`, `sidebar-page.tsx`), and a body in `SECTION_BODY`
 * (`repos-panel.tsx`) if it is a leaf. A parent needs none of the last —
 * `renderSection`'s generic wrapping branch renders it once it has no body
 * and at least one child.
 */

/**
 * A section of a repository's subtree in the sidebar.
 *
 * `actions`, `reviews`, `issues` and `tests` are here even though each
 * renders itself (`forge-sections.tsx`, `tests-section.tsx`): the point of
 * one union is that "which sections does this view show" has a single
 * answer, and a section that decided its own visibility would be a second
 * one that could disagree.
 *
 * `branches` and `forge` are parents, not sections with rows of their own —
 * see `SECTION_TREE`. `stashes` is a reserved leaf: it exists in the
 * declaration from this phase on, but Phase 22 is what gives it a body.
 */
export type SectionKey =
  | 'local'
  | 'remotes'
  | 'tags'
  | 'worktrees'
  | 'branches'
  | 'stashes'
  | 'forge'
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
 * A parent has no refs either, which is the same reason `branches` and
 * `forge` are not here.
 */
export type RefSectionKey = 'local' | 'remotes' | 'tags' | 'worktrees' | 'stashes';

/**
 * One node of the sidebar's section tree: a leaf, or a parent owning children.
 * A tree rather than a flat list with a `parent` field, so "render in order,
 * recursively" is a five-line walk and an orphaned child is unrepresentable
 * rather than merely wrong.
 */
export type SectionNode = {
  readonly key: SectionKey;
  readonly children?: readonly SectionNode[];
};

/**
 * The single ordered declaration of every section the sidebar can render, and
 * which owns which. `RepoTree` renders from this — see the "adding a
 * section" note below for what a new one costs.
 *
 * Worktrees comes first: which checkout you are looking at is the app's
 * primary context in every view (`VIEW_FILTERS` already says so for Actions
 * and Tests). `Branches` owns `Local` and `Remotes` as children rather than
 * replacing them — see the now-corrected comment in `repos-panel.tsx`.
 * `stashes` is declared here and rendered nowhere until Phase 22 supplies a
 * body for it.
 */
export const SECTION_TREE: readonly SectionNode[] = [
  { key: 'worktrees' },
  { key: 'branches', children: [{ key: 'local' }, { key: 'remotes' }] },
  { key: 'tags' },
  { key: 'stashes' },
  {
    key: 'forge',
    children: [{ key: 'actions' }, { key: 'reviews' }, { key: 'issues' }, { key: 'tests' }],
  },
];

/** A pre-order walk: a parent is listed immediately before its own children. */
function flattenSections(nodes: readonly SectionNode[]): SectionKey[] {
  const keys: SectionKey[] = [];
  for (const node of nodes) {
    keys.push(node.key);
    if (node.children) keys.push(...flattenSections(node.children));
  }
  return keys;
}

/**
 * Every section, in the order the tree renders them — derived from
 * `SECTION_TREE` by a pre-order walk rather than hand-written, so the two can
 * no longer disagree. The order matches `RepoTree`'s render order exactly,
 * which is what makes this comment true again.
 */
export const ALL_SECTIONS: readonly SectionKey[] = flattenSections(SECTION_TREE);

const PARENT_OF = new Map<SectionKey, SectionKey>();
const CHILDREN_OF = new Map<SectionKey, readonly SectionKey[]>();

(function buildLookups(nodes: readonly SectionNode[]): void {
  for (const node of nodes) {
    const childKeys = node.children?.map((child) => child.key) ?? [];
    CHILDREN_OF.set(node.key, childKeys);
    for (const childKey of childKeys) PARENT_OF.set(childKey, node.key);
    if (node.children) buildLookups(node.children);
  }
})(SECTION_TREE);

/** The section that owns `key`, or `null` for a top-level section. */
export const parentOf = (key: SectionKey): SectionKey | null => PARENT_OF.get(key) ?? null;

/** `key`'s children, in tree order — empty for a leaf. */
export const childrenOf = (key: SectionKey): readonly SectionKey[] => CHILDREN_OF.get(key) ?? [];

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
 * Now `ALL_SECTIONS` includes the parents too, which is what makes `Branches`
 * and `Forge` visible at all in an unfiltered view.
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
 *
 * Every entry here still names only leaves, exactly as before this phase —
 * naming a parent is a capability `expandFilter` adds, not a rewrite this
 * table needs, since `parentOf` already lets a leaf's ancestor be admitted
 * without saying so by hand.
 */
export const VIEW_FILTERS: Record<ViewId, ViewFilter> = {
  dashboard: WORK_IN_PROGRESS,
  files: WORK_IN_PROGRESS,
  graph: WORK_IN_PROGRESS,
  changes: WORK_IN_PROGRESS,
  actions: { sections: ['actions', 'worktrees'], dirtyOnly: false },
  tests: { sections: ['tests', 'worktrees'], dirtyOnly: false },
  reviews: { sections: ['reviews', 'worktrees'], dirtyOnly: false },
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
  view === 'changes' || view === 'actions' || view === 'tests' || view === 'reviews';

/** The effective filter for a view, given whether it is currently narrowed. */
export const filterFor = (view: ViewId, filtered: boolean): ViewFilter =>
  filtered ? VIEW_FILTERS[view] : UNFILTERED;

/**
 * Resolves which sections a filter admits, symmetric across the tree: naming
 * a parent admits its whole subtree (so `['branches']` admits `local` and
 * `remotes`), and naming a child admits its ancestors too (so today's
 * leaf-only entries such as `['actions', 'worktrees']` still let `Forge`
 * answer "admitted" once Theme C nests a heading over it — no entry above
 * needs to start naming parents for that to keep working).
 */
function expandFilter(sections: readonly SectionKey[]): ReadonlySet<SectionKey> {
  const expanded = new Set<SectionKey>();
  const addWithAncestors = (key: SectionKey): void => {
    let cursor: SectionKey | null = key;
    while (cursor !== null && !expanded.has(cursor)) {
      expanded.add(cursor);
      cursor = parentOf(cursor);
    }
  };
  for (const key of sections) {
    addWithAncestors(key);
    for (const child of childrenOf(key)) addWithAncestors(child);
  }
  return expanded;
}

/**
 * The load-bearing rule: a leaf is visible when the filter admits it; a
 * parent is visible when the filter admits it **and** at least one child is
 * visible. Recurses through `childrenOf` rather than checking one fixed
 * depth, so a section nested deeper than today's one level needs no change
 * here. A parent whose children are all filtered away does not render an
 * empty heading.
 */
function isVisibleIn(expanded: ReadonlySet<SectionKey>, key: SectionKey): boolean {
  if (!expanded.has(key)) return false;
  const children = childrenOf(key);
  return children.length === 0 || children.some((child) => isVisibleIn(expanded, child));
}

/**
 * Whether `key` renders given `filter` — the pure rule `useViewSections()`
 * wraps in a hook, exported so Theme A's tests exercise it without rendering
 * anything.
 */
export function isSectionVisible(filter: ViewFilter, key: SectionKey): boolean {
  return isVisibleIn(expandFilter(filter.sections), key);
}

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
  const expanded = expandFilter(filter.sections);

  return {
    visible: (key) => isVisibleIn(expanded, key),
    dirtyOnly: filter.dirtyOnly,
    filtered,
    toggle: () => setSectionFilter(view, !filtered),
  };
}

/**
 * Fold/unfold one of a repo's `SectionKey` headings.
 *
 * The typed wrapper around `useUiStore`'s untyped `toggleRepoSectionKey` —
 * living here rather than on the store because `ui-store.ts` cannot import
 * `SectionKey` without cycling back to this module. `RemoteGroup`'s composite
 * `remotes:<name>` keys call `toggleRepoSectionKey` directly instead; they are
 * not `SectionKey`s and have no typed wrapper to go through.
 */
export function toggleRepoSection(repoId: string, key: SectionKey): void {
  useUiStore.getState().toggleRepoSectionKey(repoId, key);
}
