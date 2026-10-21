import type { ChatSummary } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, NO_REPO, PINNED_GROUP, filterChats, groupChats, hasActiveFilters } from './chats-filter';

const DAY = 86_400_000;
const NOW = 100 * DAY;

const chat = (id: string, over: Partial<ChatSummary> = {}): ChatSummary => ({
  id,
  title: `Chat ${id}`,
  engine: 'claude',
  model: null,
  mode: 'edit',
  repoId: null,
  repoName: null,
  pinned: false,
  createdAt: NOW - DAY,
  updatedAt: NOW - 1000,
  messageCount: 2,
  preview: '',
  running: false,
  pendingChanges: false,
  ...over,
});

const LIST: ChatSummary[] = [
  chat('a', { title: 'Fix login bug', engine: 'claude', repoId: 'repo:/x/app', repoName: 'app', updatedAt: NOW - 1000, preview: 'the token expires' }),
  chat('b', { title: 'Write release notes', engine: 'codex', repoId: 'repo:/x/app', repoName: 'app', updatedAt: NOW - 3 * DAY, pinned: true }),
  chat('c', { title: 'Quick question', engine: 'ollama', repoId: null, updatedAt: NOW - 20 * DAY }),
  chat('d', { title: 'Old thing', engine: 'claude', repoId: 'repo:/x/site', repoName: 'site', updatedAt: NOW - 90 * DAY }),
];

const ids = (list: readonly ChatSummary[]) => list.map((c) => c.id);

describe('filterChats', () => {
  it('shows everything with no filters', () => {
    expect(ids(filterChats(LIST, EMPTY_FILTERS, NOW))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by engine (any of the selected)', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, engines: ['codex', 'ollama'] }, NOW))).toEqual(['b', 'c']);
  });

  it('filters by repository, with "no repository" as its own value', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, repos: ['repo:/x/app'] }, NOW))).toEqual(['a', 'b']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, repos: [NO_REPO] }, NOW))).toEqual(['c']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, repos: [NO_REPO, 'repo:/x/site'] }, NOW))).toEqual(['c', 'd']);
  });

  it('filters by date bucket', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, dates: ['today'] }, NOW))).toEqual(['a']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, dates: ['week'] }, NOW))).toEqual(['b']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, dates: ['month', 'older'] }, NOW))).toEqual(['c', 'd']);
  });

  it('filters by pinned status', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, pinned: ['pinned'] }, NOW))).toEqual(['b']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, pinned: ['unpinned'] }, NOW))).toEqual(['a', 'c', 'd']);
  });

  it('searches title, last message and repository name, case-insensitively', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, query: 'LOGIN' }, NOW))).toEqual(['a']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, query: 'token' }, NOW))).toEqual(['a']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, query: 'site' }, NOW))).toEqual(['d']);
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, query: '   ' }, NOW))).toHaveLength(4);
  });

  it('ANDs the facets together', () => {
    expect(ids(filterChats(LIST, { ...EMPTY_FILTERS, engines: ['claude'], repos: ['repo:/x/site'], query: 'old' }, NOW))).toEqual(['d']);
    expect(filterChats(LIST, { ...EMPTY_FILTERS, engines: ['codex'], pinned: ['unpinned'] }, NOW)).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the empty set and for a whitespace-only search', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '  ' })).toBe(false);
  });
  it('is true once any facet has a value', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, pinned: ['pinned'] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' })).toBe(true);
  });
});

describe('groupChats', () => {
  it('puts pinned chats first, then repos by most recent activity, then no-repo last', () => {
    const groups = groupChats(LIST);
    expect(groups.map((g) => g.key)).toEqual([PINNED_GROUP, 'repo:/x/app', 'repo:/x/site', NO_REPO]);
    expect(groups.map((g) => g.kind)).toEqual(['pinned', 'repo', 'repo', 'none']);
    expect(groups.map((g) => g.label)).toEqual(['Pinned', 'app', 'site', 'No repository']);
  });

  it('lists a pinned chat only in the pinned group', () => {
    const groups = groupChats(LIST);
    expect(ids(groups[0]!.chats)).toEqual(['b']);
    expect(ids(groups[1]!.chats)).toEqual(['a']);
  });

  it('orders chats within a group newest first', () => {
    const groups = groupChats([chat('old', { repoId: 'r', repoName: 'r', updatedAt: 1 }), chat('new', { repoId: 'r', repoName: 'r', updatedAt: 9 })]);
    expect(ids(groups[0]!.chats)).toEqual(['new', 'old']);
  });

  it('omits empty groups and returns nothing for nothing', () => {
    expect(groupChats([])).toEqual([]);
    expect(groupChats([chat('x')]).map((g) => g.key)).toEqual([NO_REPO]);
  });
});
