import type { ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  deriveAssigneeCounts,
  deriveLabelCounts,
  EMPTY_ITEM_FILTER,
  EMPTY_PROJECT_ITEM_FILTER,
  filterItems,
  filterProjectItems,
  isItemFilterEmpty,
  isProjectItemFilterEmpty,
  selectProjectItem,
  type FilterableItem,
  type ItemFilterState,
  type ProjectItemFilterState,
} from './filter';

const issue = (
  id: string,
  overrides: Partial<Extract<ForgeProjectItem['content'], { type: 'issue' }>> = {},
): ForgeProjectItem => ({
  id,
  content: {
    type: 'issue',
    id: `I_${id}`,
    number: 1,
    title: 'An issue',
    url: `https://github.com/acme/widgets/issues/1`,
    state: 'open',
    assignees: [],
    body: '',
    labels: [],
    ...overrides,
  },
  fieldValues: {},
});

const pull = (
  id: string,
  overrides: Partial<Extract<ForgeProjectItem['content'], { type: 'pull' }>> = {},
): ForgeProjectItem => ({
  id,
  content: {
    type: 'pull',
    id: `P_${id}`,
    number: 2,
    title: 'A pull request',
    url: `https://github.com/acme/widgets/pull/2`,
    state: 'open',
    assignees: [],
    body: '',
    labels: [],
    ...overrides,
  },
  fieldValues: {},
});

const draft = (
  id: string,
  overrides: Partial<Extract<ForgeProjectItem['content'], { type: 'draft' }>> = {},
): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title: 'A draft', assignees: [], body: '', ...overrides },
  fieldValues: {},
});

const filter = (overrides: Partial<ProjectItemFilterState>): ProjectItemFilterState => ({
  ...EMPTY_PROJECT_ITEM_FILTER,
  ...overrides,
});

describe('isProjectItemFilterEmpty', () => {
  it('is true for the empty filter', () => {
    expect(isProjectItemFilterEmpty(EMPTY_PROJECT_ITEM_FILTER)).toBe(true);
  });

  it('is false once any single facet is set', () => {
    expect(isProjectItemFilterEmpty(filter({ query: 'x' }))).toBe(false);
    expect(isProjectItemFilterEmpty(filter({ assignees: ['a'] }))).toBe(false);
  });

  it('treats whitespace-only query as empty', () => {
    expect(isProjectItemFilterEmpty(filter({ query: '   ' }))).toBe(true);
  });
});

describe('filterProjectItems', () => {
  it('returns everything for the empty filter', () => {
    const items = [issue('i1'), pull('i2'), draft('i3')];
    expect(filterProjectItems(items, EMPTY_PROJECT_ITEM_FILTER)).toEqual(items);
  });

  it('matches free text against title, item number and body', () => {
    const items = [
      issue('i1', { title: 'Fix the flaky test', number: 42 }),
      issue('i2', { title: 'Unrelated', number: 7, body: 'mentions flaky elsewhere' }),
      issue('i3', { title: 'Something else', number: 99 }),
    ];
    expect(filterProjectItems(items, filter({ query: 'flaky' })).map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(filterProjectItems(items, filter({ query: '42' })).map((i) => i.id)).toEqual(['i1']);
  });

  it('AND-s across facet categories, OR-s within one', () => {
    const items = [
      issue('i1', { assignees: ['alice'], labels: ['bug'] }),
      issue('i2', { assignees: ['bob'], labels: ['bug'] }),
      issue('i3', { assignees: ['alice'], labels: ['feature'] }),
    ];
    const result = filterProjectItems(items, filter({ assignees: ['alice', 'bob'], labels: ['bug'] }));
    expect(result.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('an empty facet matches everything, per the house convention', () => {
    const items = [issue('i1'), issue('i2')];
    expect(filterProjectItems(items, filter({ assignees: [] }))).toHaveLength(2);
  });

  it('a draft has no labels and no assignees to match against', () => {
    const items = [draft('i1'), issue('i2', { labels: ['bug'] })];
    expect(filterProjectItems(items, filter({ labels: ['bug'] })).map((i) => i.id)).toEqual(['i2']);
  });

  it('a draft is excluded by a non-empty states facet — it has no state at all', () => {
    const items = [draft('i1'), issue('i2', { state: 'open' })];
    expect(filterProjectItems(items, filter({ states: ['open'] })).map((i) => i.id)).toEqual(['i2']);
  });

  it('the type facet is what lets a draft back in alongside a states facet', () => {
    const items = [draft('i1'), issue('i2', { state: 'open' })];
    // A states facet alone still excludes the draft even when 'draft' is not
    // itself excluded by the (empty) types facet — state and type are
    // independent questions, and the draft simply has no answer to the first.
    expect(
      filterProjectItems(items, filter({ types: ['draft', 'issue'], states: ['open'] })).map((i) => i.id),
    ).toEqual(['i2']);
  });

  it('the merged pull state is reachable only through pulls', () => {
    const items = [pull('i1', { state: 'merged' }), issue('i2', { state: 'closed' })];
    expect(filterProjectItems(items, filter({ states: ['merged'] })).map((i) => i.id)).toEqual(['i1']);
  });
});

describe('deriveAssigneeCounts / deriveLabelCounts, over ForgeProjectItem via selectProjectItem', () => {
  it('counts each login/label across every item', () => {
    const items = [
      issue('i1', { assignees: ['alice'], labels: ['bug'] }),
      issue('i2', { assignees: ['alice', 'bob'], labels: ['bug', 'ui'] }),
      draft('i3'),
    ];
    expect(deriveAssigneeCounts(items, selectProjectItem)).toEqual(
      new Map([
        ['alice', 2],
        ['bob', 1],
      ]),
    );
    expect(deriveLabelCounts(items, selectProjectItem)).toEqual(
      new Map([
        ['bug', 2],
        ['ui', 1],
      ]),
    );
  });

  it('drafts never contribute a label, even though they carry none to begin with', () => {
    expect(deriveLabelCounts([draft('i1')], selectProjectItem).size).toBe(0);
  });
});

/*
 * ─── The generic primitives, over an issue-shaped record (Phase 54 Theme E) ─
 *
 * The actual proof the extraction is behaviour-preserving AND genuinely
 * reusable: a record that looks nothing like `ForgeProjectItem` — no
 * `content` union, no `fieldValues`, a plain `assignees`/`labels`/`state` at
 * its own top level — satisfies `filterItems` through nothing but a `select`
 * function. If this needed a second parser or a `ForgeProjectItem`-specific
 * branch anywhere in `filterItems` itself, that would be the generalisation
 * failing its own stated goal.
 */

type MinimalIssue = {
  id: string;
  title: string;
  number: number;
  state: 'open' | 'closed';
  assignees: string[];
  labels: string[];
};

const minimalIssue = (id: string, overrides: Partial<MinimalIssue> = {}): MinimalIssue => ({
  id,
  title: 'An issue',
  number: 1,
  state: 'open',
  assignees: [],
  labels: [],
  ...overrides,
});

const selectMinimalIssue = (issue: MinimalIssue): FilterableItem => ({
  title: issue.title,
  number: issue.number,
  assignees: issue.assignees,
  labels: issue.labels,
  state: issue.state,
});

const issueFilter = (overrides: Partial<ItemFilterState>): ItemFilterState => ({
  ...EMPTY_ITEM_FILTER,
  ...overrides,
});

describe('filterItems — an issue-shaped record, not ForgeProjectItem', () => {
  it('returns everything for the empty filter', () => {
    const items = [minimalIssue('i1'), minimalIssue('i2')];
    expect(filterItems(items, EMPTY_ITEM_FILTER, selectMinimalIssue)).toEqual(items);
  });

  it('matches free text against title and number, with no body field at all', () => {
    const items = [
      minimalIssue('i1', { title: 'Fix the flaky test', number: 42 }),
      minimalIssue('i2', { title: 'Something else', number: 99 }),
    ];
    expect(filterItems(items, issueFilter({ query: 'flaky' }), selectMinimalIssue).map((i) => i.id)).toEqual([
      'i1',
    ]);
    expect(filterItems(items, issueFilter({ query: '42' }), selectMinimalIssue).map((i) => i.id)).toEqual([
      'i1',
    ]);
  });

  it('filters by assignee and label, AND-ed together', () => {
    const items = [
      minimalIssue('i1', { assignees: ['alice'], labels: ['bug'] }),
      minimalIssue('i2', { assignees: ['bob'], labels: ['bug'] }),
    ];
    const result = filterItems(items, issueFilter({ assignees: ['alice'], labels: ['bug'] }), selectMinimalIssue);
    expect(result.map((i) => i.id)).toEqual(['i1']);
  });

  it('a states facet value no issue can ever carry — "merged" — matches nothing, not an error', () => {
    // `ItemFilterState['states']` is the union across every caller (Projects'
    // pulls included), not just this one's — an issue-shaped item's own
    // `state` is narrower, so this facet is simply unreachable for it, the
    // same way `filterProjectItems` above shows a draft is unreachable by it.
    const items = [minimalIssue('i1', { state: 'open' }), minimalIssue('i2', { state: 'closed' })];
    expect(filterItems(items, issueFilter({ states: ['merged'] }), selectMinimalIssue)).toHaveLength(0);
  });
});

describe('isItemFilterEmpty', () => {
  it('is true for the empty filter, with no types facet to consider', () => {
    expect(isItemFilterEmpty(EMPTY_ITEM_FILTER)).toBe(true);
  });

  it('is false once any facet is set', () => {
    expect(isItemFilterEmpty(issueFilter({ states: ['open'] }))).toBe(false);
  });
});

describe('deriveAssigneeCounts / deriveLabelCounts — generic', () => {
  it('counts across an issue-shaped record the same way it does a project item', () => {
    const items = [
      minimalIssue('i1', { assignees: ['alice'], labels: ['bug'] }),
      minimalIssue('i2', { assignees: ['alice', 'bob'], labels: ['bug', 'ui'] }),
    ];
    expect(deriveAssigneeCounts(items, selectMinimalIssue)).toEqual(
      new Map([
        ['alice', 2],
        ['bob', 1],
      ]),
    );
    expect(deriveLabelCounts(items, selectMinimalIssue)).toEqual(
      new Map([
        ['bug', 2],
        ['ui', 1],
      ]),
    );
  });
});
