import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RepoDescriptor } from '@midnite/studio-shared';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useNotesStore } from '../../store/notes-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { NotesModal } from './notes-modal';

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

  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{ui}</DialogHost>
    </QueryClientProvider>
  );
}

describe('NotesModal', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {} });
    useTerminalStore.setState({ sessions: [], activeId: null, pendingInput: {} });
    useUiStore.setState({
      notesOpen: true,
      selectedRepoId: 'repo-1',
      agentSkills: { ...DEFAULT_AGENT_SKILLS },
      primaryAgent: 'claude',
    });
  });

  afterEach(cleanup);

  it('renders empty state when no repository is open/selected', () => {
    useUiStore.setState({ selectedRepoId: null });

    const { getByText } = render(withProviders(<NotesModal />));
    expect(getByText(/notes are per-repository/i)).not.toBeNull();
  });

  it('renders empty state when selected repo has no notes', () => {
    const { getByText } = render(withProviders(<NotesModal />));
    expect(getByText(/nothing captured yet/i)).not.toBeNull();
  });

  it('creates a note on Enter from composer and clears input', () => {
    const { getByTestId, getByText } = render(withProviders(<NotesModal />));
    const composer = getByTestId('notes-composer') as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'New brilliant thought' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });

    expect(composer.value).toBe('');
    expect(getByText('New brilliant thought')).not.toBeNull();

    const notes = Object.values(useNotesStore.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe('New brilliant thought');
  });

  it('toggles hide-completed to filter out finished notes', () => {
    useNotesStore.getState().addNote('repo-1', 'Active note');
    const noteDone = useNotesStore.getState().addNote('repo-1', 'Completed note');
    useNotesStore.getState().toggleDone(noteDone.id);

    const { getByTestId, queryByText, getByText } = render(withProviders(<NotesModal />));
    expect(getByText('Active note')).not.toBeNull();
    expect(getByText('Completed note')).not.toBeNull();

    const toggleBtn = getByTestId('toggle-hide-completed');
    fireEvent.click(toggleBtn);

    expect(getByText('Active note')).not.toBeNull();
    expect(queryByText('Completed note')).toBeNull();

    // Click again to show completed
    fireEvent.click(toggleBtn);
    expect(getByText('Completed note')).not.toBeNull();
  });

  it('updates done count indicator accurately', () => {
    const note1 = useNotesStore.getState().addNote('repo-1', 'Task 1');
    useNotesStore.getState().addNote('repo-1', 'Task 2');
    useNotesStore.getState().toggleDone(note1.id);

    const { getByText } = render(withProviders(<NotesModal />));
    expect(getByText('1/2 done')).not.toBeNull();
  });
});
