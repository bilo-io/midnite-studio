import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../store/ui-store';
import { keys, useSwitchForgeAccount } from './queries';

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function installBridge(switchResult: { ok: boolean; activeAccountId: string | null }) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts: {
      switch: vi.fn().mockResolvedValue(switchResult),
    } as unknown as MidniteStudioBridge['forgeAccounts'],
  };
}

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ forgeActiveAccountId: null });
});

/**
 * Phase 90 Theme C — "no forge query serves account A's data to account B
 * after a switch", the cache-poisoning risk the phase doc names as the one
 * this phase would most regret shipping without a test for.
 */
describe('useSwitchForgeAccount — cache poisoning', () => {
  it('discards a forge fetch that resolves after the switch, rather than caching it', async () => {
    const client = new QueryClient();
    installBridge({ ok: true, activeAccountId: 'acc-b' });

    const pullsKey = keys.forgePulls('repo-1');
    let resolveAccountAFetch!: (value: string) => void;
    const accountAFetch = new Promise<string>((resolve) => {
      resolveAccountAFetch = resolve;
    });

    // Kick off an in-flight fetch under account A's identity, exactly the
    // shape a mounted Reviews section's `useQuery` would produce. The
    // switch below cancels it, which rejects THIS promise with a
    // `CancelledError` — caught here so that rejection doesn't surface as
    // an unhandled one once the switch runs.
    client.fetchQuery({ queryKey: pullsKey, queryFn: () => accountAFetch }).catch(() => undefined);
    await waitFor(() => expect(client.getQueryState(pullsKey)?.fetchStatus).toBe('fetching'));

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    // The switch has already cancelled the in-flight query. Resolving the
    // stale promise now must NOT land its payload in the cache.
    resolveAccountAFetch('account-a-pulls');
    await new Promise((r) => setTimeout(r, 0));

    expect(client.getQueryData(pullsKey)).not.toBe('account-a-pulls');
  });

  it('invalidates the forge-project family too, not only the repos/forge prefix', async () => {
    const client = new QueryClient();
    installBridge({ ok: true, activeAccountId: 'acc-b' });

    const projectFieldsKey = keys.forgeProjectFields('board-1');
    client.setQueryData(projectFieldsKey, ['stale']);

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    expect(client.getQueryState(projectFieldsKey)?.isInvalidated).toBe(true);
  });

  it('leaves non-forge queries alone', async () => {
    const client = new QueryClient();
    installBridge({ ok: true, activeAccountId: 'acc-b' });

    const statusKey = keys.status('repo-1');
    client.setQueryData(statusKey, { untouched: true });

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    expect(client.getQueryState(statusKey)?.isInvalidated).toBe(false);
  });

  it('sets forgeActiveAccountId on a successful switch', async () => {
    const client = new QueryClient();
    installBridge({ ok: true, activeAccountId: 'acc-b' });

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    expect(useUiStore.getState().forgeActiveAccountId).toBe('acc-b');
  });

  it('does not touch the active account pointer or cancel anything on a failed switch', async () => {
    const client = new QueryClient();
    installBridge({ ok: false, activeAccountId: null });
    useUiStore.setState({ forgeActiveAccountId: 'acc-a' });

    const statusKey = keys.status('repo-1');
    client.setQueryData(statusKey, { untouched: true });

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    expect(useUiStore.getState().forgeActiveAccountId).toBe('acc-a');
    expect(client.getQueryState(statusKey)?.isInvalidated).toBe(false);
  });

  /*
    Phase 90 Theme C's own settled decision: switching calls `cancelQueries`
    plus a broad `invalidateQueries` predicate rather than threading a
    literal `accountId` segment through all sixteen forge query-key builders
    (see CLAUDE.md's own count). The two tests above spot-check exactly one
    of those sixteen (`forgeProjectFields`) plus one non-forge control. This
    extends that into a table over every one of them, so a future builder
    added to `keys` without a `'forge'`/`'forge-project'` segment in its own
    key — the one thing that would silently fall outside the broad predicate
    — fails here rather than only showing up as a live cache-bleed bug.
  */
  const FORGE_DATA_KEYS: Array<[name: string, key: readonly unknown[]]> = [
    ['forge', keys.forge('repo-1')],
    ['forgeRuns', keys.forgeRuns('repo-1')],
    ['forgePulls', keys.forgePulls('repo-1')],
    ['forgeIssues', keys.forgeIssues('repo-1')],
    ['forgeIssueDetail', keys.forgeIssueDetail('repo-1', 1)],
    ['forgeIssueComments', keys.forgeIssueComments('repo-1', 1)],
    ['forgeRunDetail', keys.forgeRunDetail('repo-1', 'run-1')],
    ['forgeRunLog', keys.forgeRunLog('repo-1', 'run-1', false)],
    ['forgeWorkflows', keys.forgeWorkflows('repo-1')],
    ['forgePullDetail', keys.forgePullDetail('repo-1', 1)],
    ['forgePullFiles', keys.forgePullFiles('repo-1', 1)],
    ['forgePullComments', keys.forgePullComments('repo-1', 1)],
    ['forgePullThreads', keys.forgePullThreads('repo-1', 1)],
    ['forgeProjects', keys.forgeProjects('repo-1')],
    ['forgeProjectFields', keys.forgeProjectFields('board-1')],
    ['forgeProjectItems', keys.forgeProjectItems('board-1')],
  ];

  it.each(FORGE_DATA_KEYS)('invalidates every forge data key — %s', async (_name, key) => {
    const client = new QueryClient();
    installBridge({ ok: true, activeAccountId: 'acc-b' });
    client.setQueryData(key, { stale: true });

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync('acc-b');
    });

    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
