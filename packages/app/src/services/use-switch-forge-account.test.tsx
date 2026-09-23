import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import type { ForgeAccount, MidniteStudioBridge, RepoDescriptor } from '@midnite/studio-shared';

import { ToastHost } from '../components/toast-host';
import { useUiStore } from '../store/ui-store';
import { keys, useSwitchForgeAccount } from './queries';

// Wrapped in `<ToastHost>`: the account-switch toast (a follow-up to Phase
// 90 Theme L, this hook's own `onSuccess`) reaches `useToasts()`, which
// throws "must be used inside <ToastHost>" on mount otherwise — see
// `use-journal.ts`'s own callers for the same requirement.
function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
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

/**
 * The follow-up to Phase 90 Theme L (PR #516): the Decisions section on
 * `forge.scopeReposToActiveAccount` says a switch "should toast what it
 * hid, once, with an undo" — Theme L shipped the switch without it. Lives
 * in this hook's own `onSuccess` rather than a per-call callback at each of
 * the three switch entry points; see the doc comment above
 * `useSwitchForgeAccount` for why (the account-switcher menu unmounts
 * before a per-call callback would fire).
 */
describe('useSwitchForgeAccount — the hidden-repos toast', () => {
  const accountA: ForgeAccount = {
    id: 'gitlab:gitlab.com:octocat',
    kind: 'gitlab',
    host: 'gitlab.com',
    login: 'octocat',
    displayName: '',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
  };

  const accountB: ForgeAccount = {
    id: 'github:github.com:bilo-io',
    kind: 'github',
    host: 'github.com',
    login: 'bilo-io',
    displayName: '',
    avatarUrl: null,
    addedAt: 0,
    hasToken: false,
    delegated: 'gh',
  };

  const repo = (id: string): RepoDescriptor => ({
    id,
    path: `/r/${id}`,
    name: id,
    headRef: 'main',
    worktrees: [],
  });

  /** `on-a`'s remote is on gitlab.com; `on-b`'s is on github.com. Switching
   *  to either account hides the other's repo on a bare host mismatch —
   *  decidable from the remote alone, no reachable-repos listing needed. */
  const REMOTES: Record<string, { host: string; owner: string; kind: 'github' | 'gitlab' }> = {
    'on-a': { host: 'gitlab.com', owner: 'octocat', kind: 'gitlab' },
    'on-b': { host: 'github.com', owner: 'bilo-io', kind: 'github' },
  };

  function installFullBridge(repos: RepoDescriptor[]) {
    const switchFn = vi.fn(async ({ id }: { id: string | null }) => ({ ok: true, activeAccountId: id }));
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      forgeAccounts: {
        switch: switchFn,
        reachableRepos: vi.fn().mockResolvedValue({ ok: false, reason: 'unsupported' }),
      } as unknown as MidniteStudioBridge['forgeAccounts'],
      repos: { list: vi.fn().mockResolvedValue(repos) } as unknown as MidniteStudioBridge['repos'],
      remotes: {
        list: vi.fn(async ({ repoId }: { repoId: string }) => {
          const r = REMOTES[repoId];
          if (!r) return [];
          const url = `https://${r.host}/${r.owner}/${repoId}.git`;
          return [
            {
              name: 'origin',
              fetchUrl: url,
              pushUrl: url,
              forge: { host: r.host, owner: r.owner, repo: repoId, kind: r.kind },
            },
          ];
        }),
      } as unknown as MidniteStudioBridge['remotes'],
    };
    return switchFn;
  }

  afterEach(() => {
    cleanup();
    useUiStore.setState({ forgeAccounts: [] });
  });

  it('toasts the switched-to account and how many repos it hides, with an Undo action', async () => {
    installFullBridge([repo('on-a'), repo('on-b')]);
    useUiStore.setState({ forgeAccounts: [accountA, accountB], forgeActiveAccountId: accountA.id });

    const client = new QueryClient();
    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync(accountB.id);
    });

    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('Switched to bilo-io (github) · 1 repository hidden');
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('does not toast when the new account hides nothing (N = 0)', async () => {
    installFullBridge([repo('on-b')]);
    useUiStore.setState({ forgeAccounts: [accountA, accountB], forgeActiveAccountId: accountA.id });

    const client = new QueryClient();
    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync(accountB.id);
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Undo restores the previous account through the same hook, and does not toast again', async () => {
    installFullBridge([repo('on-a'), repo('on-b')]);
    useUiStore.setState({ forgeAccounts: [accountA, accountB], forgeActiveAccountId: accountA.id });

    const client = new QueryClient();
    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync(accountB.id);
    });

    await screen.findByRole('status');
    expect(useUiStore.getState().forgeActiveAccountId).toBe(accountB.id);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      // The undo's own mutation settling.
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(useUiStore.getState().forgeActiveAccountId).toBe(accountA.id);
    // The clicked toast dismisses itself; the undo queues no new one.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('toasts again on a second switch — "once" means once per switch, not once ever', async () => {
    installFullBridge([repo('on-a'), repo('on-b')]);
    useUiStore.setState({ forgeAccounts: [accountA, accountB], forgeActiveAccountId: accountA.id });

    const client = new QueryClient();
    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.mutateAsync(accountB.id);
    });
    const first = await screen.findByRole('status');
    expect(first.textContent).toContain('Switched to bilo-io (github)');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    await act(async () => {
      await result.current.mutateAsync(accountA.id);
    });
    const second = await screen.findByRole('status');
    expect(second.textContent).toContain('Switched to octocat (gitlab)');
  });

  it('does not toast on a failed switch', async () => {
    const client = new QueryClient();
    installBridge({ ok: false, activeAccountId: null });
    useUiStore.setState({ forgeAccounts: [accountA, accountB], forgeActiveAccountId: accountA.id });

    const { result } = renderHook(() => useSwitchForgeAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync(accountB.id);
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
