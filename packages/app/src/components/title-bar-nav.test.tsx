import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keys } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { DialogHost } from './dialog-host';
import { PAGE_LABEL_REVEAL_MS, TitleBarNav } from './title-bar-nav';

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

  it('keeps the repo and branch labels permanently, without the folding class', () => {
    client.setQueryData(keys.repos, [
      { id: 'repo-1', name: 'my-awesome-repo', path: '/path/to/my-awesome-repo', worktrees: [] },
    ]);
    client.setQueryData(keys.status('repo-1'), {
      branch: { head: 'feature/great-ui', detached: false, ahead: 0, behind: 0, upstream: null },
      entries: [],
      inProgress: null,
    });
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    render(withProviders(<TitleBarNav />, client));
    expect(screen.getByText('my-awesome-repo').className).not.toContain('breadcrumb-page-label');
    expect(screen.getByText('feature/great-ui').className).not.toContain('breadcrumb-page-label');
  });

  describe('the page label', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is revealed on arrival and folded away after PAGE_LABEL_REVEAL_MS', () => {
      render(withProviders(<TitleBarNav />, client));

      const label = screen.getByText('Graph');
      expect(label.className).toContain('breadcrumb-page-label');
      expect(label.dataset.revealed).toBe('true');

      act(() => {
        vi.advanceTimersByTime(PAGE_LABEL_REVEAL_MS);
      });

      // Still in the accessibility tree — only its width is gone, which is what
      // lets hover bring it back without a re-render.
      expect(screen.getByText('Graph').dataset.revealed).toBe('false');
    });

    it('re-reveals the label when the view changes', () => {
      render(withProviders(<TitleBarNav />, client));
      act(() => {
        vi.advanceTimersByTime(PAGE_LABEL_REVEAL_MS);
      });
      expect(screen.getByText('Graph').dataset.revealed).toBe('false');

      act(() => {
        useUiStore.setState({ activeView: 'changes' });
      });
      expect(screen.getByText('Changes').dataset.revealed).toBe('true');
    });
  });
});
