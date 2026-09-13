import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RepoDescriptor } from '@midnite/studio-shared';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useNotesStore } from '../../store/notes-store';
import { useUiStore } from '../../store/ui-store';
import { NotesView } from './notes-view';

const MOCK_REPOS: RepoDescriptor[] = [
  {
    id: 'repo-1',
    name: 'Repo One',
    path: '/tmp/repo1',
    headRef: 'main',
    worktrees: [
      {
        id: 'repo-1:/tmp/repo1/main',
        repoId: 'repo-1',
        path: '/tmp/repo1/main',
        branch: 'main',
        headSha: 'abc',
        locked: false,
        isMain: true,
        prunable: false,
      },
    ],
  },
];

function withProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(['repos'], MOCK_REPOS);

  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

/**
 * Vitest/jsdom, not e2e: this is plain store selection and conditional
 * rendering, none of the browser capabilities (`docs/TESTING.md`) that would
 * push it to Playwright.
 */
describe('NotesView', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {} });
    useUiStore.setState({ selectedRepoId: null });
  });

  afterEach(cleanup);

  it('shows a no-repo empty state with no repository open (global view)', () => {
    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText(/no repository open/i)).not.toBeNull();
  });

  it('shows a no-notes empty state for a repo with none yet', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText(/no notes yet/i)).not.toBeNull();
  });

  it('renders notes captured for the selected repo, reading the same store the modal writes', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useNotesStore.getState().addNote('repo-1', 'Ship the thing');

    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText('Ship the thing')).not.toBeNull();
  });

  it('does not render notes belonging to a different repository', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useNotesStore.getState().addNote('repo-2', 'Someone else’s note');

    const { queryByText, getByText } = render(withProviders(<NotesView />));
    expect(queryByText(/someone else/i)).toBeNull();
    expect(getByText(/no notes yet/i)).not.toBeNull();
  });
});
