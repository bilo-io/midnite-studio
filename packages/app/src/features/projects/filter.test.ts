import type { ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  deriveAssigneeCounts,
  deriveLabelCounts,
  EMPTY_PROJECT_ITEM_FILTER,
  filterItems,
  isProjectItemFilterEmpty,
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

describe('filterItems', () => {
  it('returns everything for the empty filter', () => {
    const items = [issue('i1'), pull('i2'), draft('i3')];
    expect(filterItems(items, EMPTY_PROJECT_ITEM_FILTER)).toEqual(items);
  });

  it('matches free text against title, item number and body', () => {
    const items = [
      issue('i1', { title: 'Fix the flaky test', number: 42 }),
      issue('i2', { title: 'Unrelated', number: 7, body: 'mentions flaky elsewhere' }),
      issue('i3', { title: 'Something else', number: 99 }),
    ];
    expect(filterItems(items, filter({ query: 'flaky' })).map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(filterItems(items, filter({ query: '42' })).map((i) => i.id)).toEqual(['i1']);
  });

  it('AND-s across facet categories, OR-s within one', () => {
    const items = [
      issue('i1', { assignees: ['alice'], labels: ['bug'] }),
      issue('i2', { assignees: ['bob'], labels: ['bug'] }),
      issue('i3', { assignees: ['alice'], labels: ['feature'] }),
    ];
    const result = filterItems(items, filter({ assignees: ['alice', 'bob'], labels: ['bug'] }));
    expect(result.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('an empty facet matches everything, per the house convention', () => {
    const items = [issue('i1'), issue('i2')];
    expect(filterItems(items, filter({ assignees: [] }))).toHaveLength(2);
  });

  it('a draft has no labels and no assignees to match against', () => {
    const items = [draft('i1'), issue('i2', { labels: ['bug'] })];
    expect(filterItems(items, filter({ labels: ['bug'] })).map((i) => i.id)).toEqual(['i2']);
  });

  it('a draft is excluded by a non-empty states facet — it has no state at all', () => {
    const items = [draft('i1'), issue('i2', { state: 'open' })];
    expect(filterItems(items, filter({ states: ['open'] })).map((i) => i.id)).toEqual(['i2']);
  });

  it('the type facet is what lets a draft back in alongside a states facet', () => {
    const items = [draft('i1'), issue('i2', { state: 'open' })];
    // A states facet alone still excludes the draft even when 'draft' is not
    // itself excluded by the (empty) types facet — state and type are
    // independent questions, and the draft simply has no answer to the first.
    expect(filterItems(items, filter({ types: ['draft', 'issue'], states: ['open'] })).map((i) => i.id)).toEqual([
      'i2',
    ]);
  });

  it('the merged pull state is reachable only through pulls', () => {
    const items = [pull('i1', { state: 'merged' }), issue('i2', { state: 'closed' })];
    expect(filterItems(items, filter({ states: ['merged'] })).map((i) => i.id)).toEqual(['i1']);
  });
});

describe('deriveAssigneeCounts / deriveLabelCounts', () => {
  it('counts each login/label across every item', () => {
    const items = [
      issue('i1', { assignees: ['alice'], labels: ['bug'] }),
      issue('i2', { assignees: ['alice', 'bob'], labels: ['bug', 'ui'] }),
      draft('i3'),
    ];
    expect(deriveAssigneeCounts(items)).toEqual(new Map([['alice', 2], ['bob', 1]]));
    expect(deriveLabelCounts(items)).toEqual(new Map([['bug', 2], ['ui', 1]]));
  });

  it('drafts never contribute a label, even though they carry none to begin with', () => {
    expect(deriveLabelCounts([draft('i1')]).size).toBe(0);
  });
});
