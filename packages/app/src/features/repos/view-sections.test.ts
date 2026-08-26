import { describe, expect, it } from 'vitest';

import { VIEW_IDS, type ViewId } from '../../store/ui-store';
import {
  ALL_SECTIONS,
  filterFor,
  filtersByDefault,
  UNFILTERED,
  VIEW_FILTERS,
} from './view-sections';

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
  it('lists all seven, Dashboard first', () => {
    expect(VIEW_IDS).toHaveLength(7);
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
      graph: false,
      changes: false,
      actions: false,
      tests: false,
      settings: false,
    };
    for (const view of VIEW_IDS) seen[view] = true;
    expect(Object.values(seen).every(Boolean)).toBe(true);
  });
});
