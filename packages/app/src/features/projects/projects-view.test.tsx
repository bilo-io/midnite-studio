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

type ProjectView = {
  filter: { query: string; assignees: string[]; labels: string[]; types: string[]; states: string[] };
  groupFieldId: string | null;
  sort: { fieldId: string; direction: 'asc' | 'desc' } | null;
  collapsedColumns: string[];
};
// `vi.hoisted` because the mock factory below runs the moment some other
// import (transitively, `DialogHost` → `context-menu.tsx` → `ui-store`)
// pulls the mocked module in — which happens before this file's own
// top-level `const`s run, even though they read earlier on the page.
const DEFAULT_PROJECT_VIEW_MOCK = vi.hoisted(
  (): ProjectView => ({
    filter: { query: '', assignees: [], labels: [], types: [], states: [] },
    groupFieldId: null,
    sort: null,
    collapsedColumns: [],
  }),
);
let projectViewByProject: Record<string, ProjectView> = {};
const setProjectView = vi.fn((projectId: string, patch: Partial<ProjectView>) => {
  const current = projectViewByProject[projectId] ?? DEFAULT_PROJECT_VIEW_MOCK;
  projectViewByProject = { ...projectViewByProject, [projectId]: { ...current, ...patch } };
});

vi.mock('../../store/ui-store', () => ({
  DEFAULT_PROJECT_VIEW: DEFAULT_PROJECT_VIEW_MOCK,
  useUiStore: Object.assign(
    (
      selector: (state: {
        projectBoardByRepo: Record<string, string>;
        setProjectBoard: typeof setProjectBoard;
        forgeWritesEnabled: boolean;
        projectsMode: Record<string, 'table' | 'board'>;
        setProjectsMode: typeof setProjectsMode;
        projectViewByProject: Record<string, ProjectView>;
        setProjectView: typeof setProjectView;
      }) => unknown,
    ) =>
      selector({
        projectBoardByRepo: boardByRepo,
        setProjectBoard,
        forgeWritesEnabled,
        projectsMode,
        setProjectsMode,
        projectViewByProject,
        setProjectView,
      }),
    {
      /*
        The static half of zustand's API, which the hook half of this mock does
        not imply. `useDismiss` (Phase 62) reads the occluder counters
        imperatively — `useUiStore.getState().incrementOccluders()` — when the
        filter toolbar's <MultiSelectMenu> registers on the dismissal stack, and
        a bare selector function has no `getState` to call.
      */
      getState: () => ({ incrementOccluders: () => {}, decrementOccluders: () => {} }),
    },
  ),
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
    projectViewByProject = {};
    setProjectView.mockClear();
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

  it('clicking Board view persists the mode choice per repo', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));

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

describe('Phase 52 — filter toolbar, group-by, sort', () => {
  beforeEach(() => {
    list.mockReset();
    fields.mockReset();
    items.mockReset();
    boardByRepo = { 'repo-1': 'PVT_1' };
    setProjectBoard.mockClear();
    forgeWritesEnabled = false;
    projectsMode = {};
    setProjectsMode.mockClear();
    projectViewByProject = {};
    setProjectView.mockClear();

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
          content: {
            type: 'issue',
            id: 'I_1',
            number: 1,
            title: 'Fix the flaky test',
            url: 'https://github.com/acme/widgets/issues/1',
            state: 'open',
            assignees: ['alice'],
            body: '',
            labels: [],
          },
          fieldValues: {},
        },
        {
          id: 'item2',
          content: {
            type: 'issue',
            id: 'I_2',
            number: 2,
            title: 'Something else',
            url: 'https://github.com/acme/widgets/issues/2',
            state: 'open',
            assignees: ['bob'],
            body: '',
            labels: [],
          },
          fieldValues: {},
        },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });
  });

  it('renders the toolbar once items have loaded, in Table mode', async () => {
    renderWithClient();
    expect(await screen.findByPlaceholderText('Search title, number or body…')).toBeDefined();
    expect(screen.getByRole('button', { name: 'All assignees' })).toBeDefined();
  });

  it('typing a search query persists it per project', async () => {
    renderWithClient();
    const input = await screen.findByPlaceholderText('Search title, number or body…');

    fireEvent.change(input, { target: { value: 'flaky' } });

    expect(setProjectView).toHaveBeenCalledWith('PVT_1', {
      filter: { query: 'flaky', assignees: [], labels: [], types: [], states: [] },
    });
  });

  it('picking an assignee facet persists the selection', async () => {
    renderWithClient();
    await screen.findByPlaceholderText('Search title, number or body…');

    fireEvent.click(screen.getByRole('button', { name: 'All assignees' }));
    fireEvent.click(await screen.findByRole('option', { name: /alice/ }));

    expect(setProjectView).toHaveBeenCalledWith('PVT_1', {
      filter: { query: '', assignees: ['alice'], labels: [], types: [], states: [] },
    });
  });

  it('clicking a sortable column header cycles the sort, persisted per project', async () => {
    renderWithClient();
    const header = await screen.findByRole('button', { name: 'Sort by Status' });

    fireEvent.click(header);
    expect(setProjectView).toHaveBeenCalledWith('PVT_1', { sort: { fieldId: 'f1', direction: 'asc' } });

    projectViewByProject = { PVT_1: { ...DEFAULT_PROJECT_VIEW_MOCK, sort: { fieldId: 'f1', direction: 'asc' } } };
    cleanup();
    renderWithClient();
    fireEvent.click(await screen.findByRole('button', { name: /Sort by Status/ }));
    expect(setProjectView).toHaveBeenCalledWith('PVT_1', { sort: { fieldId: 'f1', direction: 'desc' } });
  });

  it('shows a "Group by" picker only in Board mode, defaulting to Status', async () => {
    renderWithClient();
    await screen.findByPlaceholderText('Search title, number or body…');
    expect(screen.queryByLabelText('Group by')).toBeNull();

    cleanup();
    projectsMode = { 'repo-1': 'board' };
    renderWithClient();

    expect(await screen.findByLabelText('Group by')).toBeDefined();
    expect(screen.getByRole('option', { name: 'Status' })).toBeDefined();
  });

  it('changing the group-by picker persists the chosen field', async () => {
    fields.mockResolvedValue({
      cli: CLI_READY,
      fields: [
        { id: 'f1', name: 'Status', dataType: 'single_select', options: [] },
        { id: 'f2', name: 'Priority', dataType: 'single_select', options: [] },
      ],
      error: null,
      kind: 'ok',
    });
    projectsMode = { 'repo-1': 'board' };
    renderWithClient();

    const picker = await screen.findByLabelText('Group by');
    fireEvent.change(picker, { target: { value: 'f2' } });

    expect(setProjectView).toHaveBeenCalledWith('PVT_1', { groupFieldId: 'f2' });
  });
});
