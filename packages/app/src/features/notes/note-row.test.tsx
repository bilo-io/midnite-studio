import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RepoDescriptor } from '@midnite/studio-shared';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { Note, useNotesStore } from '../../store/notes-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { NoteRow } from './note-row';

const MOCK_REPO: RepoDescriptor = {
  id: 'repo-1',
  name: 'Studio',
  path: '/tmp/studio',
  headRef: 'main',
  worktrees: [
    {
      id: 'repo-1:/tmp/studio/main',
      repoId: 'repo-1',
      path: '/tmp/studio/main',
      branch: 'main',
      headSha: 'abc',
      locked: false,
      isMain: true,
      prunable: false,
    },
  ],
};

function withProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{ui}</DialogHost>
    </QueryClientProvider>
  );
}

describe('NoteRow', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {} });
    useTerminalStore.setState({ sessions: [], activeId: null, pendingInput: {} });
    useUiStore.setState({ agentSkills: { ...DEFAULT_AGENT_SKILLS }, primaryAgent: 'claude' });
  });

  afterEach(cleanup);

  const baseNote: Note = {
    id: 'note-1',
    repoId: 'repo-1',
    body: 'Initial note content',
    status: 'captured',
    done: false,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('toggles done on checkbox click', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByRole } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    const checkbox = getByRole('checkbox', { name: /mark note completed/i });

    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox);
    expect(useNotesStore.getState().notes[baseNote.id]?.done).toBe(true);
  });

  it('supports in-place editing with Enter committing', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    const bodyEl = getByTestId('note-body');
    fireEvent.click(bodyEl);

    const textarea = getByTestId('note-edit-input') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea, { target: { value: 'Edited text' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(useNotesStore.getState().notes[baseNote.id]?.body).toBe('Edited text');
  });

  it('allows Shift+Enter to newline without committing edit', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    fireEvent.click(getByTestId('note-body'));

    const textarea = getByTestId('note-edit-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    // Still editing
    expect(getByTestId('note-edit-input')).not.toBeNull();
    expect(useNotesStore.getState().notes[baseNote.id]?.body).toBe('Initial note content');
  });

  it('cancels editing on Escape without deleting', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const onParentKeyDown = vi.fn();
    const { getByTestId, queryByTestId } = render(
      withProviders(
        <div onKeyDown={onParentKeyDown}>
          <NoteRow note={baseNote} repo={MOCK_REPO} />
        </div>,
      ),
    );
    fireEvent.click(getByTestId('note-body'));

    const textarea = getByTestId('note-edit-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Changed text' } });

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(queryByTestId('note-edit-input')).toBeNull();
    expect(useNotesStore.getState().notes[baseNote.id]?.body).toBe('Initial note content');
  });

  it('cancels edit on empty input rather than deleting note', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    fireEvent.click(getByTestId('note-body'));

    const textarea = getByTestId('note-edit-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.blur(textarea);

    expect(useNotesStore.getState().notes[baseNote.id]?.body).toBe('Initial note content');
  });

  it('cycles status when status badge is clicked', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    const badge = getByTestId('note-status-badge');

    expect(badge.textContent).toBe('captured');
    fireEvent.click(badge);
    expect(useNotesStore.getState().notes[baseNote.id]?.status).toBe('planned');

    fireEvent.click(badge);
    expect(useNotesStore.getState().notes[baseNote.id]?.status).toBe('implemented');

    fireEvent.click(badge);
    expect(useNotesStore.getState().notes[baseNote.id]?.status).toBe('captured');
  });

  it('triggers brainstorm handoff on Draft plan click and sets status to planned', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });
    const onHandoff = vi.fn();

    const { getByRole } = render(
      withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} onHandoff={onHandoff} />),
    );
    const draftBtn = getByRole('button', { name: /draft plan/i });
    fireEvent.click(draftBtn);

    expect(onHandoff).toHaveBeenCalledTimes(1);
    expect(useNotesStore.getState().notes[baseNote.id]?.status).toBe('planned');
    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
  });

  it('disables handoff buttons when repo is missing', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByRole } = render(withProviders(<NoteRow note={baseNote} repo={undefined} />));
    const draftBtn = getByRole('button', { name: /draft plan/i });
    const adhocBtn = getByRole('button', { name: /adhoc task/i });

    expect(draftBtn.getAttribute('aria-disabled')).toBe('true');
    expect(adhocBtn.getAttribute('aria-disabled')).toBe('true');
  });
});
