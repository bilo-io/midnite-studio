import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ProjectsView } from './projects-view';

afterEach(cleanup);

/*
  The real `useForgeProjects`/`useForgeProjectFields`/`useForgeProjectItems`
  hooks run against a mocked `bridge()`, so this test proves the actual
  `enabled` gating in `queries.ts` — not a re-implementation of it — matching
  the phase doc's own acceptance criterion: opening the view with no board
  picked must issue zero item fetches.
*/
const list = vi.fn();
const fields = vi.fn();
const items = vi.fn();
const setField = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { list, fields, items, setField },
  }),
}));

vi.mock('../../services/use-status', () => ({
  useActiveWorktree: () => ({ repoId: 'repo-1' }),
}));

let boardByRepo: Record<string, string> = {};
const setProjectBoard = vi.fn((repoId: string, projectId: string) => {
  boardByRepo = { ...boardByRepo, [repoId]: projectId };
});
let forgeWritesEnabled = false;

let projectsMode: Record<string, 'table' | 'board'> = {};
const setProjectsMode = vi.fn((repoId: string, mode: 'table' | 'board') => {
  projectsMode = { ...projectsMode, [repoId]: mode };
});

vi.mock('../../store/ui-store', () => ({
  useUiStore: (
    selector: (state: {
      projectBoardByRepo: Record<string, string>;
      setProjectBoard: typeof setProjectBoard;
      forgeWritesEnabled: boolean;
      projectsMode: Record<string, 'table' | 'board'>;
      setProjectsMode: typeof setProjectsMode;
    }) => unknown,
  ) =>
    selector({
      projectBoardByRepo: boardByRepo,
      setProjectBoard,
      forgeWritesEnabled,
      projectsMode,
      setProjectsMode,
    }),
}));

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Board mode's cards reach `useDialogs()` for their "Move to ▸" menu
  // (Phase 41 Theme C) — the host every render needs, matching the real tree.
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <ProjectsView />
      </DialogHost>
    </QueryClientProvider>,
  );
}

const CLI_READY = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

describe('ProjectsView', () => {
  beforeEach(() => {
    list.mockReset();
    fields.mockReset();
    items.mockReset();
    setField.mockReset();
    boardByRepo = {};
    setProjectBoard.mockClear();
    forgeWritesEnabled = false;
    projectsMode = {};
    setProjectsMode.mockClear();
  });

  it('issues zero item fetches when no board has been picked', async () => {
    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
      ],
      error: null,
      kind: 'ok',
    });

    renderWithClient();

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Pick a board')).toBeDefined();
    expect(fields).not.toHaveBeenCalled();
    expect(items).not.toHaveBeenCalled();
  });

  it('shows the no-boards state without ever asking for fields or items', async () => {
    list.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });

    renderWithClient();

    expect(await screen.findByText('No projects')).toBeDefined();
    expect(fields).not.toHaveBeenCalled();
    expect(items).not.toHaveBeenCalled();
  });

  it('shows the missing-scope state with the exact fix command, verbatim', async () => {
    list.mockResolvedValue({ cli: CLI_READY, projects: [], error: 'missing scope', kind: 'insufficient-scope' });

    renderWithClient();

    expect(await screen.findByText('GitHub Projects needs one more permission')).toBeDefined();
    expect(screen.getByText('gh auth refresh -s project')).toBeDefined();
  });

  it('fetches fields and items once a board is picked', async () => {
    boardByRepo = { 'repo-1': 'PVT_1' };
    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
      ],
      error: null,
      kind: 'ok',
    });
    fields.mockResolvedValue({ cli: CLI_READY, fields: [], error: null, kind: 'ok' });
    items.mockResolvedValue({ cli: CLI_READY, items: [], nextCursor: null, error: null, kind: 'ok' });

    renderWithClient();

    await waitFor(() => expect(items).toHaveBeenCalledWith({ projectId: 'PVT_1' }));
    expect(fields).toHaveBeenCalledWith({ projectId: 'PVT_1' });
    expect(await screen.findByText('No items')).toBeDefined();
  });

  it('clicking Board persists the mode choice per repo', async () => {
    boardByRepo = { 'repo-1': 'PVT_1' };
    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
      ],
      error: null,
      kind: 'ok',
    });
    fields.mockResolvedValue({ cli: CLI_READY, fields: [], error: null, kind: 'ok' });
    items.mockResolvedValue({ cli: CLI_READY, items: [], nextCursor: null, error: null, kind: 'ok' });

    renderWithClient();
    await screen.findByText('No items');

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    expect(setProjectsMode).toHaveBeenCalledWith('repo-1', 'board');
  });

  it('with the mode already set to board, renders the board view instead of the table', async () => {
    boardByRepo = { 'repo-1': 'PVT_1' };
    projectsMode = { 'repo-1': 'board' };
    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
      ],
      error: null,
      kind: 'ok',
    });
    fields.mockResolvedValue({
      cli: CLI_READY,
      fields: [{ id: 'f1', name: 'Status', dataType: 'single_select', options: [{ id: 'todo', name: 'Todo', color: 'GRAY' }] }],
      error: null,
      kind: 'ok',
    });
    items.mockResolvedValue({
      cli: CLI_READY,
      items: [
        {
          id: 'item1',
          content: { type: 'draft', id: 'DI_1', title: 'A draft item', assignees: [], body: '' },
          fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'todo', name: 'Todo' } },
        },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });

    renderWithClient();

    expect(await screen.findByTestId('board-view')).toBeDefined();
    expect(screen.getByText('Todo')).toBeDefined();
    expect(screen.getByText('A draft item')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    // The phase doc's own Theme I acceptance test: one item read for the
    // whole board, never one per column.
    expect(items).toHaveBeenCalledTimes(1);
  });
});
