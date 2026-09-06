import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ProjectsView } from './projects-view';

/**
 * jsdom has no `ResizeObserver`, and reports a fixed `clientWidth`/
 * `clientHeight` of 0 — both needed once Graph mode mounts
 * `ProjectGraphView`, whose graph-space culling would otherwise treat every
 * node as outside a zero-size viewport. See `project-graph-view.test.tsx`
 * for the same two stubs, for the same reason.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});

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

// `agent`/`terminal`/`hasBridge` are reached once a card's detail pane opens
// (Phase 75 Theme G lifted selection into this view, so board mode and
// graph mode both mount `CardPanelStack` → `CardDetail` → `CardComposer`,
// which queries the agent roster the moment a card is open) — the same
// fixtures `board-view.test.tsx`/`card-composer.test.tsx` already use.
vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { list, fields, items, setField },
    terminal: { list: vi.fn(async () => ({ sessions: [] })), save: vi.fn() },
    agent: {
      list: vi.fn(async () => ({
        agents: [{ id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#000' }],
        status: [],
      })),
    },
  }),
  hasBridge: () => true,
}));

vi.mock('../../services/use-status', () => ({
  useActiveWorktree: () => ({ repoId: 'repo-1', worktreePath: '/repo' }),
}));

let boardByRepo: Record<string, string> = {};
const setProjectBoard = vi.fn((repoId: string, projectId: string) => {
  boardByRepo = { ...boardByRepo, [repoId]: projectId };
});
let forgeWritesEnabled = false;

let projectsMode: Record<string, 'table' | 'board' | 'graph'> = {};
const setProjectsMode = vi.fn((repoId: string, mode: 'table' | 'board' | 'graph') => {
  projectsMode = { ...projectsMode, [repoId]: mode };
});

type GraphFacets = { showContains: boolean; only: 'all' | 'blocked' | 'ready'; depth: 0 | 1 | 2; hideIsolated: boolean };
type ProjectView = {
  filter: { query: string; assignees: string[]; labels: string[]; types: string[]; states: string[] };
  groupFieldId: string | null;
  sort: { fieldId: string; direction: 'asc' | 'desc' } | null;
  collapsedColumns: string[];
  graph?: GraphFacets;
};
const DEFAULT_GRAPH_FACETS_MOCK: GraphFacets = { showContains: false, only: 'all', depth: 0, hideIsolated: false };
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
    graph: { showContains: false, only: 'all', depth: 0, hideIsolated: false },
  }),
);
let projectViewByProject: Record<string, ProjectView> = {};
const setProjectView = vi.fn((projectId: string, patch: Partial<ProjectView>) => {
  const current = projectViewByProject[projectId] ?? DEFAULT_PROJECT_VIEW_MOCK;
  projectViewByProject = { ...projectViewByProject, [projectId]: { ...current, ...patch } };
});
let blockedByFieldName = 'Blocked by';
const setBlockedByFieldName = vi.fn((name: string) => {
  blockedByFieldName = name;
});

vi.mock('../../store/ui-store', () => ({
  DEFAULT_PROJECT_VIEW: DEFAULT_PROJECT_VIEW_MOCK,
  useUiStore: Object.assign(
    (
      selector: (state: {
        projectBoardByRepo: Record<string, string>;
        setProjectBoard: typeof setProjectBoard;
        forgeWritesEnabled: boolean;
        projectsMode: Record<string, 'table' | 'board' | 'graph'>;
        setProjectsMode: typeof setProjectsMode;
        projectViewByProject: Record<string, ProjectView>;
        setProjectView: typeof setProjectView;
        blockedByFieldName: string;
        setBlockedByFieldName: typeof setBlockedByFieldName;
        detachedPages: readonly string[];
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
        blockedByFieldName,
        setBlockedByFieldName,
        // The view's header carries a `<PageDetachMark>`, which reads this to
        // decide between "detach" and "focus the window you already have".
        detachedPages: [],
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
    blockedByFieldName = 'Blocked by';
    setBlockedByFieldName.mockClear();
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
    blockedByFieldName = 'Blocked by';
    setBlockedByFieldName.mockClear();

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

describe('Phase 75 Theme D — graph mode', () => {
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
    blockedByFieldName = 'Blocked by';
    setBlockedByFieldName.mockClear();

    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false },
      ],
      error: null,
      kind: 'ok',
    });
    fields.mockResolvedValue({ cli: CLI_READY, fields: [], error: null, kind: 'ok' });
  });

  it('clicking Graph view persists the mode choice per repo', async () => {
    items.mockResolvedValue({ cli: CLI_READY, items: [], nextCursor: null, error: null, kind: 'ok' });
    renderWithClient();
    await screen.findByText('No items');

    fireEvent.click(screen.getByRole('button', { name: 'Graph view' }));

    expect(setProjectsMode).toHaveBeenCalledWith('repo-1', 'graph');
  });

  it('an unrecognised persisted mode coerces to table rather than passing through', async () => {
    projectsMode = { 'repo-1': 'kanban-3000' as never };
    items.mockResolvedValue({ cli: CLI_READY, items: [], nextCursor: null, error: null, kind: 'ok' });
    renderWithClient();

    // 'table' is the only mode whose "no items" path renders through the
    // ProjectItemsTable branch's own empty state — reaching it at all is the
    // proof the bogus value never reached `mode`.
    expect(await screen.findByText('No items')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Table view' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the dependency graph, with a real blocks edge, once items load', async () => {
    items.mockResolvedValue({
      cli: CLI_READY,
      items: [
        {
          id: 'item1',
          content: {
            type: 'issue',
            id: 'I_1',
            number: 1,
            title: 'The blocker',
            url: 'https://github.com/acme/widgets/issues/1',
            state: 'open',
            assignees: [],
            body: '',
            labels: [],
            // `bridge()` is mocked here with a raw object, skipping the real
            // zod parse `.default({})` would otherwise supply — so this
            // suite's own fixtures carry every field verbatim, the same rule
            // `kanban.spec.ts` states for `body`/`labels`.
            dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
          },
        },
        {
          id: 'item2',
          content: {
            type: 'issue',
            id: 'I_2',
            number: 2,
            title: 'The dependent',
            url: 'https://github.com/acme/widgets/issues/2',
            state: 'open',
            assignees: [],
            body: '',
            labels: [],
            dependencies: {
              blockedBy: [{ number: 1, title: 'The blocker', state: 'open', repo: '' }],
              parent: null,
              subIssues: [],
              blockedByTruncated: false,
              subIssuesTruncated: false,
            },
          },
        },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });
    projectsMode = { 'repo-1': 'graph' };
    renderWithClient();

    expect(await screen.findByTestId('project-graph-view')).toBeDefined();
    expect(screen.getByText('The blocker')).toBeDefined();
    expect(screen.getByText('The dependent')).toBeDefined();
  });

  it('all-drafts-or-PRs renders the dedicated empty state, not a canvas', async () => {
    items.mockResolvedValue({
      cli: CLI_READY,
      items: [
        { id: 'd1', content: { type: 'draft', id: 'DI_1', title: 'A draft item', assignees: [], body: '' } },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });
    projectsMode = { 'repo-1': 'graph' };
    renderWithClient();

    expect(await screen.findByText('Dependencies live on issues. This board has none.')).toBeDefined();
    expect(screen.queryByTestId('project-graph-view')).toBeNull();
  });
});

describe('Phase 75 Theme G — one selection, agent gate', () => {
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
  });

  it('selecting an item in board mode keeps card-detail open for it after switching to graph mode', async () => {
    projectsMode = { 'repo-1': 'board' };
    fields.mockResolvedValue({
      cli: CLI_READY,
      fields: [
        { id: 'f1', name: 'Status', dataType: 'single_select', options: [{ id: 'todo', name: 'Todo', color: 'GRAY' }] },
      ],
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
            number: 30,
            title: 'The issue card',
            url: 'https://github.com/acme/widgets/issues/30',
            state: 'open',
            assignees: [],
            body: '',
            labels: [],
            dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
          },
          fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'todo', name: 'Todo' } },
        },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });

    // Not `renderWithClient()`: this test needs the same `ProjectsView`
    // instance to persist across the mode flip (its lifted `selectedItemId`
    // is a `useState`), so it drives `render`/`rerender` on a freshly-built
    // tree each time — a *cached* element would let `QueryClientProvider`
    // bail out on referentially-equal props and never re-render `ProjectsView`
    // at all, exactly the trap `board-view.test.tsx`'s own `tree(...)`
    // function (not a plain constant) already avoids.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <DialogHost>
          <ProjectsView />
        </DialogHost>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());

    await screen.findByTestId('board-view');
    fireEvent.click(screen.getByText('The issue card'));
    expect(await screen.findByTestId('card-detail')).toBeDefined();

    projectsMode = { 'repo-1': 'graph' };
    rerender(tree());

    expect(await screen.findByTestId('project-graph-view')).toBeDefined();
    expect(screen.getByTestId('card-detail')).toBeDefined();
  });

  it('an api-sourced blocker disables Start with a title naming it; a body-sourced one leaves it enabled', async () => {
    projectsMode = { 'repo-1': 'graph' };
    fields.mockResolvedValue({ cli: CLI_READY, fields: [], error: null, kind: 'ok' });
    items.mockResolvedValue({
      cli: CLI_READY,
      items: [
        {
          id: 'item-api',
          content: {
            type: 'issue',
            id: 'I_1',
            number: 10,
            title: 'Blocked via API',
            url: 'https://github.com/acme/widgets/issues/10',
            state: 'open',
            assignees: [],
            body: '',
            labels: [],
            dependencies: {
              blockedBy: [{ number: 199, title: 'Upstream', state: 'open', repo: '' }],
              parent: null,
              subIssues: [],
              blockedByTruncated: false,
              subIssuesTruncated: false,
            },
          },
          fieldValues: {},
        },
        {
          id: 'item-body',
          content: {
            type: 'issue',
            id: 'I_2',
            number: 20,
            title: 'Blocked via body',
            url: 'https://github.com/acme/widgets/issues/20',
            state: 'open',
            assignees: [],
            body: 'Blocked by #204',
            labels: [],
            dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
          },
          fieldValues: {},
        },
      ],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });

    renderWithClient();
    await screen.findByTestId('project-graph-view');

    fireEvent.click(screen.getByText('Blocked via API'));
    const apiStart = await screen.findByTestId('card-start');
    expect(apiStart).toHaveProperty('disabled', true);
    expect(apiStart.getAttribute('title')).toBe('Blocked by #199');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByText('Blocked via body'));
    const bodyStart = await screen.findByTestId('card-start');
    expect(bodyStart).toHaveProperty('disabled', false);
  });
});
