import { createElement } from 'react';

import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';

import type { BranchStatus, StatusResult } from '@midnite/git-shared';

import { DialogHost } from '../../components/dialog-host';
import { keys } from '../queries';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { useCommandHandlers } from './use-command-handlers';

const BRANCH_CLEAN: BranchStatus = {
  head: 'main',
  oid: 'abc123',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  detached: false,
  unborn: false,
};

const statusWith = (branch: Partial<BranchStatus>): StatusResult => ({
  branch: { ...BRANCH_CLEAN, ...branch },
  entries: [],
  inProgress: null,
});

const REPO_ID = 'repo-1';

const withProviders = (client: QueryClient) =>
  renderHook(() => useCommandHandlers(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, createElement(DialogHost, null, children)),
  });

beforeEach(() => {
  useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: null, activeView: 'graph' });
  useWorkbenchStore.setState({ tabs: [], activeTabId: null });
});

describe('useCommandHandlers — no repo open', () => {
  it('disables repo.close, view.refresh, status.commit and the sync family, all for the same reason', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of ['repo.close', 'view.refresh', 'status.commit', 'sync.fetch', 'sync.pull', 'sync.push'] as const) {
      expect(runtime[id].enabled).toBe(false);
      expect(runtime[id].disabledReason).toBe('Open a repository first');
    }
  });

  it('leaves navigation, terminal and repo.open enabled with nothing selected', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of [
      'terminal.toggle',
      'terminal.focus',
      'repos.toggle',
      'browser.open',
      'repo.open',
      'graph.focus',
      'status.focus',
    ] as const) {
      expect(runtime[id].enabled).toBe(true);
    }
  });

  it('leaves op.abort, op.continue and the palette commands disabled, with a reason', () => {
    const { result } = withProviders(new QueryClient());
    const runtime = result.current;

    for (const id of ['op.abort', 'op.continue', 'palette.open', 'palette.files'] as const) {
      expect(runtime[id].enabled).toBe(false);
      expect(runtime[id].disabledReason?.length).toBeGreaterThan(0);
    }
  });
});

describe('useCommandHandlers — a repo is selected', () => {
  const seededClient = (branch: Partial<BranchStatus>) => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, [{ id: REPO_ID, name: 'demo', path: '/demo', worktrees: [] }]);
    client.setQueryData(keys.status(REPO_ID), statusWith(branch));
    return client;
  };

  it('enables repo.close and view.refresh', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID });
    const { result } = withProviders(seededClient({}));
    expect(result.current['repo.close'].enabled).toBe(true);
    expect(result.current['view.refresh'].enabled).toBe(true);
  });

  it('disables status.commit off the working tree, and enables it on it', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'graph' });
    const { result: offTree } = withProviders(seededClient({}));
    expect(offTree.current['status.commit'].enabled).toBe(false);
    expect(offTree.current['status.commit'].disabledReason).toBe(
      'Switch to the working tree to commit',
    );

    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'changes' });
    useWorkbenchStore.setState({ activeTabId: null });
    const { result: onTree } = withProviders(seededClient({}));
    expect(onTree.current['status.commit'].enabled).toBe(true);
  });

  it('disables status.commit when the Changes view is open on a non-working-tree tab', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID, activeView: 'changes' });
    useWorkbenchStore.setState({ activeTabId: 'some-tab' });
    const { result } = withProviders(seededClient({}));
    expect(result.current['status.commit'].enabled).toBe(false);
  });

  it('wires sync.* through the same syncAffordances rules the sync cluster uses', () => {
    useUiStore.setState({ selectedRepoId: REPO_ID });
    const { result } = withProviders(seededClient({ behind: 2, ahead: 0 }));
    expect(result.current['sync.pull'].enabled).toBe(true);
    expect(result.current['sync.push'].enabled).toBe(false);
    expect(result.current['sync.push'].disabledReason).toBe('Nothing to push.');
  });
});
