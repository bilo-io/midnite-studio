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
});
