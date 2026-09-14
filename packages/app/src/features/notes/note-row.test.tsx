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
    order: 0,
  };

  it('toggles done on checkbox click', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByRole } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    const checkbox = getByRole('checkbox', { name: /mark note completed/i });

    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox);
    expect(useNotesStore.getState().notes[baseNote.id]?.done).toBe(true);
  });

  it('does not open in-place editor on double-click', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId, queryByTestId } = render(
      withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />),
    );

    fireEvent.doubleClick(getByTestId('note-body'));
    expect(queryByTestId('note-edit-input')).toBeNull();
  });

  it('calls onSelect when clicked', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });
    const onSelect = vi.fn();

    const { getByTestId } = render(
      withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} onSelect={onSelect} />),
    );

    fireEvent.click(getByTestId(`note-row-${baseNote.id}`));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders selected styling when selected is true', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(
      withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} selected={true} />),
    );

    const row = getByTestId(`note-row-${baseNote.id}`);
    expect(row.className).toContain('border-primary/50');
    expect(row.className).toContain('ring-1');
  });

  it('has consistent fixed card height and flex-col layout', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));
    const row = getByTestId(`note-row-${baseNote.id}`);

    expect(row.className).toContain('h-[96px]');
    expect(row.className).toContain('flex-col');
    expect(row.className).toContain('justify-between');
  });

  it('clamps the note body preview to 3 lines with ellipsis', () => {
    const longNote: Note = { ...baseNote, body: 'one\ntwo\nthree\nfour\nfive' };
    useNotesStore.setState({ notes: { [longNote.id]: longNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={longNote} repo={MOCK_REPO} />));
    const body = getByTestId('note-body');

    expect(body.textContent).toBe('one\ntwo\nthree\nfour\nfive');
    expect(body.className).toContain('line-clamp-3');
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

  it('exposes a drag handle for reordering', () => {
    useNotesStore.setState({ notes: { [baseNote.id]: baseNote } });

    const { getByTestId } = render(withProviders(<NoteRow note={baseNote} repo={MOCK_REPO} />));

    expect(getByTestId('note-drag-handle').getAttribute('aria-label')).toBe('Reorder note');
  });
});
