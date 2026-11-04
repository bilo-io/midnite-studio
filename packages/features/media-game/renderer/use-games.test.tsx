// vitest/jsdom: the Games list refetches when the app's repo list changes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { GAME_KEYS, useGamesFollowRepos } from './use-games';

afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  client.setQueryData(GAME_KEYS.list, []);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  renderHook(() => useGamesFollowRepos(), { wrapper });
  const listStale = () => client.getQueryState(GAME_KEYS.list)?.isInvalidated ?? false;
  return { client, listStale };
}

describe('useGamesFollowRepos', () => {
  it('invalidates the games list when the repo list gets new data', async () => {
    const { client, listStale } = setup();
    expect(listStale()).toBe(false);
    await client.fetchQuery({ queryKey: ['repos'], queryFn: async () => [{ id: 'r1', path: '/GameDev/gtact' }] });
    await waitFor(() => expect(listStale()).toBe(true));
  });

  it('ignores per-repo queries under the same prefix', async () => {
    const { client, listStale } = setup();
    await client.fetchQuery({ queryKey: ['repos', 'r1', 'refs'], queryFn: async () => [] });
    expect(listStale()).toBe(false);
  });
});
