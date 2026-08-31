import { createElement } from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RepoDescriptor, Worktree } from '@midnite/studio-shared';

import { keys } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useDefaultSelection } from './use-default-selection';

const worktree = (path: string, isMain: boolean): Worktree => ({
  id: `r1:${path}`,
  repoId: 'r1',
  path,
  branch: isMain ? 'main' : 'feature',
  headSha: 'abc123',
  locked: false,
  isMain,
  prunable: false,
});

const repo = (worktrees: Worktree[]): RepoDescriptor => ({
  id: 'r1',
  path: worktrees.find((w) => w.isMain)?.path ?? worktrees[0]!.path,
  name: 'r1',
  headRef: 'main',
  worktrees,
});

const withClient = (client: QueryClient) =>
  renderHook(() => useDefaultSelection(), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

describe('useDefaultSelection', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: null });
  });

  // Without this, a hook instance from an earlier test in this file stays
  // mounted and subscribed to the shared `useUiStore` singleton — the next
  // test's `setState` re-triggers its effect against a stale `QueryClient`
  // and clobbers the state the new test just set.
  afterEach(cleanup);

  it('leaves selectedRepoId alone when null', () => {
    const client = newClient();
    client.setQueryData(keys.repos, [repo([worktree('/repo', true)])]);

    withClient(client);

    expect(useUiStore.getState().selectedRepoId).toBe(null);
    expect(useUiStore.getState().selectedWorktreePath).toBe(null);
  });

  it('selects the main worktree when a repo is selected without worktree', () => {
    const client = newClient();
    client.setQueryData(keys.repos, [repo([worktree('/repo', true)])]);
    useUiStore.setState({ selectedRepoId: 'r1', selectedWorktreePath: null });

    withClient(client);

    expect(useUiStore.getState().selectedRepoId).toBe('r1');
    expect(useUiStore.getState().selectedWorktreePath).toBe('/repo');
  });

  it('falls back to the main worktree when the selected worktree is removed out-of-band', () => {
    // The bug this covers: `git worktree remove` run from a terminal (rather
    // than through the app) dropped the linked worktree from `repo.worktrees`,
    // but `selectedWorktreePath` kept pointing at it forever — the sidebar and
    // Changes panel kept showing that dead worktree "selected" with whatever
    // status it last fetched.
    const client = newClient();
    const main = worktree('/repo', true);
    const linked = worktree('/repo-wt', false);
    client.setQueryData(keys.repos, [repo([main, linked])]);
    useUiStore.setState({ selectedRepoId: 'r1', selectedWorktreePath: '/repo-wt' });

    const { rerender } = withClient(client);
    expect(useUiStore.getState().selectedWorktreePath).toBe('/repo-wt');

    client.setQueryData(keys.repos, [repo([main])]);
    rerender();

    expect(useUiStore.getState().selectedWorktreePath).toBe('/repo');
  });

  it('leaves the selection alone when the selected worktree still exists', () => {
    const client = newClient();
    const main = worktree('/repo', true);
    const linked = worktree('/repo-wt', false);
    client.setQueryData(keys.repos, [repo([main, linked])]);
    useUiStore.setState({ selectedRepoId: 'r1', selectedWorktreePath: '/repo-wt' });

    const { rerender } = withClient(client);
    client.setQueryData(keys.repos, [repo([main, linked])]);
    rerender();

    expect(useUiStore.getState().selectedWorktreePath).toBe('/repo-wt');
  });
});
