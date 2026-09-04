import type { ForgeIssue, ForgeIssuesResult } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { IssuesView } from './issues-view';

/*
 * Exercises `IssuesView`'s list pane, not a standalone `IssueList` unit —
 * `rows`/`empty`/`disabled`/`error` all live in the view, the same split
 * `ActionsView` draws around `RunList`: a list component only ever renders
 * once its caller has already ruled those states out.
 */

const issuesFn = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ forge: { issues: issuesFn } }),
  hasBridge: () => true,
}));

function issue(overrides: Partial<ForgeIssue> = {}): ForgeIssue {
  return {
    id: '',
    number: 1,
    title: 'Something is broken',
    state: 'open',
    author: 'bilo',
    labels: [],
    assignees: [],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: null,
    url: 'https://github.com/bilo-io/midnite-studio/issues/1',
    milestone: null,
    ...overrides,
  };
}

function result(overrides: Partial<ForgeIssuesResult> = {}): ForgeIssuesResult {
  return {
    cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
    issues: [],
    disabled: false,
    error: null,
    ...overrides,
  };
}

function renderView() {
  useUiStore.setState({ selectedRepoId: 'repo-1' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IssuesView />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  issuesFn.mockReset();
  useUiStore.setState({ selectedRepoId: null });
});

describe('IssuesView — list pane', () => {
  it('renders a row per issue', async () => {
    issuesFn.mockResolvedValue(
      result({ issues: [issue({ number: 1, title: 'First' }), issue({ number: 2, title: 'Second' })] }),
    );
    renderView();

    const list = await screen.findByRole('list', { name: 'Issues' });
    expect(within(list).getByText('First')).not.toBeNull();
    expect(within(list).getByText('Second')).not.toBeNull();
  });

  it('shows an empty message with no issues', async () => {
    issuesFn.mockResolvedValue(result({ issues: [] }));
    renderView();

    expect(await screen.findByText('No issues.')).not.toBeNull();
  });

  it('renders a sentence, not an error, when the tracker is disabled', async () => {
    issuesFn.mockResolvedValue(result({ disabled: true }));
    renderView();

    expect(await screen.findByText('Issues are turned off for this repository.')).not.toBeNull();
  });

  it('renders the error as a destructive notice', async () => {
    issuesFn.mockResolvedValue(result({ error: 'gh: command not found' }));
    renderView();

    expect(await screen.findByText('gh: command not found')).not.toBeNull();
  });
});
