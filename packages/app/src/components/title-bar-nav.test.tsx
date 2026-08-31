import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { keys } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { DialogHost } from './dialog-host';
import { TitleBarNav } from './title-bar-nav';

function withProviders(ui: React.ReactElement, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <DialogHost>{ui}</DialogHost>
    </QueryClientProvider>
  );
}

describe('TitleBarNav Breadcrumbs', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useUiStore.setState({
      selectedRepoId: null,
      selectedWorktreePath: null,
      activeView: 'graph',
    });
  });

  afterEach(cleanup);

  it('renders repo breadcrumb with rainbow pill class when repo selected', () => {
    client.setQueryData(keys.repos, [
      {
        id: 'repo-1',
        name: 'my-awesome-repo',
        path: '/path/to/my-awesome-repo',
        worktrees: [],
      },
    ]);
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    render(withProviders(<TitleBarNav />, client));
    const repoElement = screen.getByText('my-awesome-repo').closest('.breadcrumb-repo-pill');
    expect(repoElement).not.toBeNull();
  });

  it('renders branch breadcrumb with bold primary color class', () => {
    client.setQueryData(keys.repos, [
      {
        id: 'repo-1',
        name: 'my-awesome-repo',
        path: '/path/to/my-awesome-repo',
        worktrees: [],
      },
    ]);
    client.setQueryData(keys.status('repo-1'), {
      branch: { head: 'feature/great-ui', detached: false, ahead: 0, behind: 0, upstream: null },
      entries: [],
      inProgress: null,
    });
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    render(withProviders(<TitleBarNav />, client));
    const branchText = screen.getByText('feature/great-ui');
    expect(branchText).toBeDefined();
    expect(branchText.className).toContain('font-bold');
    expect(branchText.className).toContain('text-primary');
  });
});
