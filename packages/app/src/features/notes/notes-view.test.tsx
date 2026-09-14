/**
 * Vitest/jsdom — plain store transitions and conditional rendering.
 *
 * Why not Playwright: no real layout/getBoundingClientRect, no CSS, no pointer
 * drag, no xterm, no canvas. Everything tested here is text, roles, and store
 * state — exactly the vitest layer per docs/TESTING.md.
 *
 * Monaco is mocked to avoid the jsdom crash from Monaco's web-worker and DOM
 * APIs it needs that jsdom does not provide.
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RepoDescriptor } from '@midnite/studio-shared';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useNotesStore } from '../../store/notes-store';
import { useUiStore } from '../../store/ui-store';
import { NotesView } from './notes-view';

// ── Monaco mock ──────────────────────────────────────────────────────────────
// The real CodeEditor mounts a Monaco worker that jsdom cannot handle.
// A controlled-value shim is enough to verify the content-pane rendering,
// the `key` remount, and the preview toggle.
vi.mock('../files/preview/code-editor', () => ({
  CodeEditor: ({
    value,
    onChange,
    fileName,
  }: {
    value?: string;
    onChange?: (v: string) => void;
    fileName: string;
  }) => (
    <div data-testid="monaco-editor" data-filename={fileName}>
      <pre>{value}</pre>
      <button
        type="button"
        data-testid="mock-editor-change"
        onClick={() => onChange?.('edited value')}
      >
        trigger change
      </button>
    </div>
  ),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── suite ────────────────────────────────────────────────────────────────────

describe('NotesView', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {}, hydrated: true });
    useUiStore.setState({ selectedRepoId: null });
    // Reset layout to defaults so resizable widths are predictable
    useUiStore.setState((s) => ({
      layout: {
        ...s.layout,
        notesListWidth: 320,
      },
    }));
  });

  afterEach(cleanup);

  // ── no-repo guard ──────────────────────────────────────────────────────────
  it('shows a no-repo empty state when no repository is open', () => {
    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText(/no repository open/i)).not.toBeNull();
  });

  // ── sidenav list ──────────────────────────────────────────────────────────
  it('shows a nothing-captured empty state for a repo with no notes', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText(/nothing captured yet/i)).not.toBeNull();
  });

  it('renders notes for the selected repo in the sidenav', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useNotesStore.getState().addNote('repo-1', 'Ship the thing');

    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText('Ship the thing')).not.toBeNull();
  });

  it('does not render notes from a different repository', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useNotesStore.getState().addNote('repo-2', 'Other repo note');

    const { queryByText, getByText } = render(withProviders(<NotesView />));
    expect(queryByText(/other repo note/i)).toBeNull();
    expect(getByText(/nothing captured yet/i)).not.toBeNull();
  });

  // ── hideCompleted toggle ───────────────────────────────────────────────────
  it('hides completed notes when the toggle is active', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Done task');
    useNotesStore.getState().toggleDone(note.id);

    const { getByText, getByTestId, queryByText } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId('toggle-hide-completed'));
    // The note body should be hidden
    expect(queryByText('Done task')).toBeNull();
    expect(getByText(/all completed notes are hidden/i)).not.toBeNull();
  });

  it('shows completed notes again after toggling back', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Done again');
    useNotesStore.getState().toggleDone(note.id);

    const { getByText, getByTestId } = render(withProviders(<NotesView />));
    // Hide…
    fireEvent.click(getByTestId('toggle-hide-completed'));
    // …then show again
    fireEvent.click(getByTestId('toggle-hide-completed'));
    expect(getByText('Done again')).not.toBeNull();
  });

  // ── selection → content pane ───────────────────────────────────────────────
  it('shows a select-a-note prompt in the content pane with no selection', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useNotesStore.getState().addNote('repo-1', 'My note');

    const { getByText } = render(withProviders(<NotesView />));
    expect(getByText(/select a note to edit it/i)).not.toBeNull();
  });

  it('shows the Monaco editor with the note body when a note is selected', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Hello Monaco');

    const { getByTestId } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));

    await waitFor(() => {
      const editor = getByTestId('monaco-editor');
      expect(editor).not.toBeNull();
      // The note body appears in both the sidenav and the editor's <pre> mock —
      // assert on the editor element directly rather than the shared text.
      expect(editor.querySelector('pre')?.textContent).toBe('Hello Monaco');
    });
  });

  it('passes fileName as <noteId>.md to CodeEditor', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Markdown file');

    const { getByTestId } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));

    await waitFor(() => {
      const editor = getByTestId('monaco-editor');
      expect(editor.getAttribute('data-filename')).toBe(`${note.id}.md`);
    });
  });

  // ── autosave ───────────────────────────────────────────────────────────────
  it('writes the edited value back to the store via onChange', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Original');

    const { getByTestId } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));

    await waitFor(() => expect(getByTestId('mock-editor-change')).not.toBeNull());
    fireEvent.click(getByTestId('mock-editor-change'));

    await waitFor(() => {
      const stored = useNotesStore.getState().notes[note.id];
      expect(stored?.body).toBe('edited value');
    });
  });

  // ── markdown preview toggle ────────────────────────────────────────────────
  it('switches to markdown preview and back', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', '## Heading');

    const { getByTestId, getByLabelText, queryByTestId } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));

    // Editor is shown first
    await waitFor(() => expect(getByTestId('monaco-editor')).not.toBeNull());

    // Toggle to preview
    fireEvent.click(getByLabelText('Show preview'));
    await waitFor(() => {
      expect(queryByTestId('monaco-editor')).toBeNull();
      // MarkdownPreview renders a div with the content
      expect(document.body.textContent).toContain('Heading');
    });

    // Toggle back to editor
    fireEvent.click(getByLabelText('Show editor'));
    await waitFor(() => expect(getByTestId('monaco-editor')).not.toBeNull());
  });

  // ── content-pane status badge ──────────────────────────────────────────────
  it('cycles the note status via the content-pane badge', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Cycle me');

    const { getByTestId } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));

    await waitFor(() => expect(getByTestId('content-status-badge')).not.toBeNull());

    // captured → planned
    fireEvent.click(getByTestId('content-status-badge'));
    await waitFor(() => {
      expect(useNotesStore.getState().notes[note.id]?.status).toBe('planned');
    });

    // planned → implemented
    fireEvent.click(getByTestId('content-status-badge'));
    await waitFor(() => {
      expect(useNotesStore.getState().notes[note.id]?.status).toBe('implemented');
    });
  });

  // ── selection cleared on note deletion ────────────────────────────────────
  it('clears the content pane when the selected note is removed from the store', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Ephemeral');

    const { getByTestId, getByText } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));
    await waitFor(() => expect(getByTestId('monaco-editor')).not.toBeNull());

    // Remove the note externally (simulates a delete from the modal)
    useNotesStore.getState().removeNote(note.id);
    await waitFor(() => {
      expect(getByText(/select a note to edit it/i)).not.toBeNull();
    });
  });

  // ── selection cleared on repo switch ──────────────────────────────────────
  it('clears the content pane on repo switch', async () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    const note = useNotesStore.getState().addNote('repo-1', 'Repo one note');

    const { getByTestId, getByText } = render(withProviders(<NotesView />));
    fireEvent.click(getByTestId(`note-list-item-${note.id}`));
    await waitFor(() => expect(getByTestId('monaco-editor')).not.toBeNull());

    useUiStore.setState({ selectedRepoId: null });
    // No-repo guard takes over
    await waitFor(() => expect(getByText(/no repository open/i)).not.toBeNull());
  });
});
