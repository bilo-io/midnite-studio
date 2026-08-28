import { describe, expect, it } from 'vitest';

import { VIEW_IDS, type ViewId } from '../../store/ui-store';
import {
  ALL_SECTIONS,
  childrenOf,
  filterFor,
  filtersByDefault,
  isSectionVisible,
  parentOf,
  SECTION_TREE,
  UNFILTERED,
  VIEW_FILTERS,
  type SectionKey,
  type SectionNode,
  type ViewFilter,
} from './view-sections';

/**
 * Every `SectionNode` in `SECTION_TREE`, parents and leaves alike, walked
 * once — an independent re-implementation of the module's own flatten, so
 * this test actually checks `ALL_SECTIONS` against the tree rather than
 * against itself.
 */
function walk(nodes: readonly SectionNode[]): SectionKey[] {
  const keys: SectionKey[] = [];
  for (const node of nodes) {
    keys.push(node.key);
    if (node.children) keys.push(...walk(node.children));
  }
  return keys;
}

describe('filtersByDefault', () => {
  it('narrows the views that ARE a question about a subset', () => {
    // Changes is about work in progress, Actions about CI, Tests about suites.
    // A full tree beside any of them answers a different question.
    for (const view of ['changes', 'actions', 'tests'] as const) {
      expect(filtersByDefault(view)).toBe(true);
    }
  });

  it('leaves every other view showing the whole tree', () => {
    // The Graph view is about history and the Files view about files on disk;
    // neither has a reason to care whether a checkout is dirty, and a tree that
    // quietly dropped repos there would look like they had closed.
    for (const view of ['graph', 'files', 'dashboard', 'settings'] as const) {
      expect(filtersByDefault(view)).toBe(false);
    }
  });
});

describe('VIEW_FILTERS', () => {
  it('answers for every view, so a new one cannot reach the sidebar unmapped', () => {
    for (const view of VIEW_IDS) {
      expect(VIEW_FILTERS[view]).toBeDefined();
    }
  });

  it('keeps Worktrees in every narrowed view', () => {
    // Which checkout you are asking about is the app's primary context in every
    // view; a narrowing that removed it would leave the view unable to say what
    // its data is even about.
    for (const view of VIEW_IDS) {
      expect(VIEW_FILTERS[view].sections).toContain('worktrees');
    }
  });

  it('gives Actions and Tests their own section, and no dirty-checkout filter', () => {
    expect(VIEW_FILTERS.actions.sections).toEqual(['actions', 'worktrees']);
    expect(VIEW_FILTERS.tests.sections).toEqual(['tests', 'worktrees']);

    // Hiding clean checkouts in Actions would hide the checkouts whose CI you
    // came to read — being dirty has nothing to do with having runs.
    expect(VIEW_FILTERS.actions.dirtyOnly).toBe(false);
    expect(VIEW_FILTERS.tests.dirtyOnly).toBe(false);
  });

  it('narrows Changes to dirty checkouts only, as Phase 17 did', () => {
    expect(VIEW_FILTERS.changes).toEqual({ sections: ['worktrees'], dirtyOnly: true });
  });

  it('never lists a section twice', () => {
    for (const view of VIEW_IDS) {
      const { sections } = VIEW_FILTERS[view];
      expect(new Set(sections).size).toBe(sections.length);
    }
  });

  it('only names sections that exist', () => {
    for (const view of VIEW_IDS) {
      for (const key of VIEW_FILTERS[view].sections) {
        expect(ALL_SECTIONS).toContain(key);
      }
    }
  });
});

describe('filterFor', () => {
  it('shows the whole tree, dirty or not, whenever a view is unfiltered', () => {
    for (const view of VIEW_IDS) {
      const filter = filterFor(view, false);
      expect(filter).toBe(UNFILTERED);
      expect(filter.sections).toEqual(ALL_SECTIONS);
      expect(filter.dirtyOnly).toBe(false);
    }
  });

  it('is the escape hatch: unfiltering Actions puts every section back', () => {
    // The whole point of "Show all sections" — wanting a branch mid-triage must
    // not be a reason to leave the view.
    expect(filterFor('actions', true).sections).not.toContain('local');
    expect(filterFor('actions', true).sections).not.toContain('reviews');
    expect(filterFor('actions', false).sections).toContain('local');
    expect(filterFor('actions', false).sections).toContain('reviews');
  });

  it('lets a view with no narrowing of its own still be filtered by hand', () => {
    // Phase 17 shipped this: the sidebar's filter button works in Graph too,
    // and folding the Changes filter into the view table must not remove it.
    const graph = filterFor('graph', true);
    expect(graph.dirtyOnly).toBe(true);
    expect(graph.sections).toEqual(['worktrees']);
  });
});

describe('view ids', () => {
  it('lists all nine, Dashboard first', () => {
    expect(VIEW_IDS).toHaveLength(9);
    expect(VIEW_IDS[0]).toBe('dashboard');
  });


  it('has no duplicates', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length);
  });

  /**
   * A compile-time check written as a runtime one: if `ViewId` gains a member,
   * `VIEW_IDS` must gain it too, or every per-view map silently stops covering
   * it while still typechecking as a complete `Record`.
   */
  it('covers the ViewId union', () => {
    const seen: Record<ViewId, boolean> = {
      dashboard: false,
      files: false,
      search: false,
      graph: false,
      changes: false,
      actions: false,
      tests: false,
      reviews: false,
      settings: false,
    };
    for (const view of VIEW_IDS) seen[view] = true;
    expect(Object.values(seen).every(Boolean)).toBe(true);

  });
});

describe('SECTION_TREE', () => {
  const ALL_KEYS: readonly SectionKey[] = [
    'local',
    'remotes',
    'tags',
    'worktrees',
    'branches',
    'stashes',
    'forge',
    'actions',
    'reviews',
    'issues',
    'tests',
  ];

  it('is the source ALL_SECTIONS is flattened from — no second, disagreeing answer', () => {
    expect(ALL_SECTIONS).toEqual(walk(SECTION_TREE));
  });

  it('lists Worktrees first', () => {
    expect(ALL_SECTIONS[0]).toBe('worktrees');
  });

  it('names every SectionKey exactly once', () => {
    for (const key of ALL_KEYS) {
      expect(ALL_SECTIONS.filter((k) => k === key)).toHaveLength(1);
    }
    expect(ALL_SECTIONS).toHaveLength(ALL_KEYS.length);
  });
});

describe('parentOf / childrenOf', () => {
  it('round-trip: every child of a parent names that parent back', () => {
    for (const key of ALL_SECTIONS) {
      for (const child of childrenOf(key)) {
        expect(parentOf(child)).toBe(key);
      }
    }
  });

  it('gives Branches its two children and Forge its four', () => {
    expect(childrenOf('branches')).toEqual(['local', 'remotes']);
    expect(childrenOf('forge')).toEqual(['actions', 'reviews', 'issues', 'tests']);
  });

  it('has no children for a leaf, and no parent for a top-level section', () => {
    expect(childrenOf('worktrees')).toEqual([]);
    expect(parentOf('worktrees')).toBeNull();
    expect(parentOf('branches')).toBeNull();
  });
});

describe('isSectionVisible', () => {
  const NAMES_BRANCHES: ViewFilter = { sections: ['branches'], dirtyOnly: false };
  const NAMES_ONLY_WORKTREES: ViewFilter = { sections: ['worktrees'], dirtyOnly: false };

  it('a filter naming a parent admits its children', () => {
    expect(isSectionVisible(NAMES_BRANCHES, 'local')).toBe(true);
    expect(isSectionVisible(NAMES_BRANCHES, 'remotes')).toBe(true);
    expect(isSectionVisible(NAMES_BRANCHES, 'branches')).toBe(true);
  });

  it('a filter naming only worktrees hides branches, and everything under it', () => {
    expect(isSectionVisible(NAMES_ONLY_WORKTREES, 'branches')).toBe(false);
    expect(isSectionVisible(NAMES_ONLY_WORKTREES, 'local')).toBe(false);
    expect(isSectionVisible(NAMES_ONLY_WORKTREES, 'remotes')).toBe(false);
  });

  it('a parent whose every child is filtered away is not visible itself', () => {
    // 'branches' is reachable only through its own children in `expandFilter`,
    // so a filter that names neither it nor a child never admits it.
    expect(isSectionVisible(NAMES_ONLY_WORKTREES, 'branches')).toBe(false);
  });

  it("today's leaf-only forge filters still admit Forge once it is nested", () => {
    // VIEW_FILTERS.actions never names 'forge' directly; naming a child must
    // still let the (not-yet-rendered) parent answer "admitted".
    expect(isSectionVisible(VIEW_FILTERS.actions, 'forge')).toBe(true);
    expect(isSectionVisible(VIEW_FILTERS.actions, 'actions')).toBe(true);
    expect(isSectionVisible(VIEW_FILTERS.actions, 'reviews')).toBe(false);
  });

  it('the unfiltered view admits every parent and every leaf', () => {
    for (const key of ALL_SECTIONS) {
      expect(isSectionVisible(UNFILTERED, key)).toBe(true);
    }
  });
});
