import { createElement } from 'react';

import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys, reorderByIds, useReorderRepos } from './queries';

describe('reorderByIds', () => {
  it('applies a new id order to the matching items', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(reorderByIds(items, ['c', 'a', 'b'])).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  });

  it('drops an id the list has no entry for', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(reorderByIds(items, ['b', 'ghost', 'a'])).toEqual([{ id: 'b' }, { id: 'a' }]);
  });

  it('keeps each item unchanged, not just its id', () => {
    const items = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    expect(reorderByIds(items, ['b', 'a'])).toEqual([
      { id: 'b', name: 'Beta' },
      { id: 'a', name: 'Alpha' },
    ]);
  });
});

describe('useReorderRepos', () => {
  /**
   * The bug this covers: a repo drag used to snap straight back, because
   * `repos.reorder` is a one-way IPC call with nothing to await, and nothing
   * ever told the `repos` query to refetch. The row order the sidebar renders
   * has to change the instant the drop settles, not on the next refetch.
   */
  const withClient = (client: QueryClient) =>
    renderHook(() => useReorderRepos(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

  it('writes the new order into the repos query cache synchronously', () => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const { result } = withClient(client);
    result.current(['c', 'a', 'b']);

    expect(client.getQueryData(keys.repos)).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  });

  it('leaves an empty cache alone rather than inventing repos', () => {
    const client = new QueryClient();

    const { result } = withClient(client);
    result.current(['a', 'b']);

    expect(client.getQueryData(keys.repos)).toBeUndefined();
  });
});
