import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Remote } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { ToastHost } from '../../components/toast-host';
import { useTerminalStore } from '../terminal/terminal-store';
import { TasksView } from './tasks-view';

/**
 * jsdom reports a fixed `clientWidth`/`clientHeight` of 0 — needed once
 * Graph mode mounts `ProjectGraphView`, whose graph-space culling would
 * otherwise treat every node as outside a zero-size viewport. See
 * `project-graph-view.test.tsx` for the same stub, for the same reason.
 *
 * The local `ResizeObserver` override below is now a **deliberate
 * downgrade**, not a redundant restatement of a missing global — since
 * Phase 82 Theme C, `vitest-setup.ts` installs a *firing* default
 * (`FiringResizeObserver`) precisely so `@tanstack/react-virtual` measures
 * something. This file still stubs its own non-firing one on top, because
 * this suite was written against, and still asserts, the *other* documented
 * finding below (Table mode's virtualized rows are read only through the
 * toolbar, never row content) — swapping in a firing observer here without
 * auditing every assertion in the file is Wave 2's job (`packages/app`
 * Phase 82 Theme C's migration list names `projects-view` explicitly), not
 * a side effect of this comment update. Confirmed empirically: dropping this
 * override and letting the global firing default apply does make Table
 * mode's row content render (`screen.findByText` on a seeded item title
 * resolves) — the finding two dozen lines below is now false in general, it
 * just still holds *for this file* until Wave 2 removes this override and
 * verifies the rest of the suite against it.
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
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
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
const remotesList = vi.fn<() => Promise<Remote[]>>(async () => []);

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { list, fields, items, setField },
    // Phase 84 Theme C: `useForgeSubscription('projects')` mounts unconditionally now.
    forge: { subscribe: vi.fn(), unsubscribe: vi.fn(), onChanged: vi.fn(() => () => {}) },
    // The board picker's repo-vs-org grouping reads this via `useRemotes` —
    // empty by default so existing fixtures below (which set no repo forge)
    // still resolve every board into the "Organization" group unchanged.
    remotes: { list: remotesList },
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

// The Reload button's terminal hand-off — the real one opens a pty session
// through the terminal store, which this suite has no reason to stand up.
const submitCommand = vi.fn();
vi.mock('../terminal/submit-command', () => ({
  submitCommand: (...args: unknown[]) => submitCommand(...args),
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
// `vi.hoisted` because the mock factory below runs the moment some other
// import (transitively, `DialogHost` → `context-menu.tsx` → `ui-store`)
// pulls the mocked module in — which happens before this file's own
// top-level `const`s run, even though they read earlier on the page. Its own
// literal is inlined rather than reading `DEFAULT_GRAPH_FACETS_MOCK` below,
// which is itself a plain (non-hoisted) `const` and so not yet initialised
// the moment this factory runs.
const DEFAULT_PROJECT_VIEW_MOCK = vi.hoisted(
  (): ProjectView => ({
    filter: { query: '', assignees: [], labels: [], types: [], states: [] },
    groupFieldId: null,
    sort: null,
    collapsedColumns: [],
    graph: { showContains: false, only: 'all', depth: 0, hideIsolated: false },
  }),
);
const DEFAULT_GRAPH_FACETS_MOCK: GraphFacets = { showContains: false, only: 'all', depth: 0, hideIsolated: false };
let projectViewByProject: Record<string, ProjectView> = {};
const setProjectView = vi.fn((projectId: string, patch: Partial<ProjectView>) => {
  const current = projectViewByProject[projectId] ?? DEFAULT_PROJECT_VIEW_MOCK;
  projectViewByProject = { ...projectViewByProject, [projectId]: { ...current, ...patch } };
});
let blockedByFieldName = 'Blocked by';
const setBlockedByFieldName = vi.fn((name: string) => {
  blockedByFieldName = name;
});
// `useCardPlay` (Phase 92 Theme D) and `CardDetail`'s own Skill picker
// (Theme C) both read/write these — a board-mode card is rendered here too.
let cardSkillByTask: Record<string, string> = {};
const setCardSkill = vi.fn((taskKey: string, skillId: string | undefined) => {
  if (skillId === undefined) {
    const { [taskKey]: _dropped, ...rest } = cardSkillByTask;
    cardSkillByTask = rest;
  } else {
    cardSkillByTask = { ...cardSkillByTask, [taskKey]: skillId };
  }
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
        cardSkillByTask: Record<string, string>;
        setCardSkill: typeof setCardSkill;
        agentSkills: Record<string, string | undefined>;
        // Drag-to-skill's own column → skill map (Phase 95 Theme G) —
        // `BoardView` reads this unconditionally now, so the mock needs the
        // key even though no test here drives a real drag.
        columnSkillByProject: Record<string, Record<string, string>>;
        // Auto-mate (Phase 95 Theme H) — `useAutomate` reads these
        // unconditionally now, the same reason `columnSkillByProject` is here.
        automateEnabledByProject: Record<string, boolean>;
        automateCapByProject: Record<string, number>;
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
        cardSkillByTask,
        setCardSkill,
        agentSkills: {},
        columnSkillByProject: {},
        automateEnabledByProject: {},
        automateCapByProject: {},
      }),
    {
      /*
        The static half of zustand's API, which the hook half of this mock does
        not imply. `useDismiss` (Phase 62) reads the occluder counters
        imperatively — `useUiStore.getState().incrementOccluders()` — when the
        filter toolbar's <MultiSelectMenu> registers on the dismissal stack, and
        a bare selector function has no `getState` to call.
      */
      getState: () => ({
        incrementOccluders: () => {},
        decrementOccluders: () => {},
        // `resolveSessionAttribution`/`use-automate.ts` reach these via the
        // vanilla `getState()` escape hatch (Phase 95 Theme H), same as the
        // occluder counters above.
        forgeAccounts: [] as { id: string; kind: string }[],
        forgeActiveAccountId: null as string | null,
        setAutomateEnabled: () => {},
      }),
    },
  ),
}));

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Board mode's cards reach `useDialogs()` for their "Move to ▸" menu
  // (Phase 41 Theme C), and `BoardView` itself now reaches `useToasts()`
  // unconditionally for drag-to-skill's own Undo toast (Phase 95 Theme G) —
  // both hosts every render needs, matching the real tree.
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        <DialogHost>
          <TasksView />
        </DialogHost>
      </ToastHost>
    </QueryClientProvider>,
  );
}

const CLI_READY = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

describe('TasksView', () => {
  beforeEach(() => {
    list.mockReset();
    fields.mockReset();
    items.mockReset();
    setField.mockReset();
    remotesList.mockReset();
    remotesList.mockResolvedValue([]);
    boardByRepo = {};
    setProjectBoard.mockClear();
    forgeWritesEnabled = false;
    projectsMode = {};
    setProjectsMode.mockClear();
    projectViewByProject = {};
    setProjectView.mockClear();
    blockedByFieldName = 'Blocked by';
    setBlockedByFieldName.mockClear();
    cardSkillByTask = {};
    setCardSkill.mockClear();
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

  it('groups the board picker into This repo vs Organization by linkedToRepo', async () => {
    remotesList.mockResolvedValue([
      {
        name: 'origin',
        fetchUrl: 'https://github.com/acme/widgets.git',
        pushUrl: 'https://github.com/acme/widgets.git',
        forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' as const },
      },
    ]);
    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [
        { id: 'PVT_repo', number: 1, title: 'Repo board', url: 'https://x', closed: false, linkedToRepo: true },
        { id: 'PVT_org', number: 2, title: 'Roadmap', url: 'https://x', closed: false, linkedToRepo: false },
      ],
      error: null,
      kind: 'ok',
    });

    renderWithClient();

    const repoGroup = await screen.findByRole('group', { name: 'This repo' });
    expect(within(repoGroup).getByRole('option', { name: 'Repo board' })).toBeDefined();

    const orgGroup = screen.getByRole('group', { name: 'Organization: acme' });
    expect(within(orgGroup).getByRole('option', { name: 'Roadmap' })).toBeDefined();
  });

  it('shows the no-boards state without ever asking for fields or items', async () => {
    list.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });

    renderWithClient();

    expect(await screen.findByText('No projects')).toBeDefined();
    expect(fields).not.toHaveBeenCalled();
    expect(items).not.toHaveBeenCalled();
  });

  describe('Reload on the board list\'s empty and error states', () => {
    beforeEach(() => {
      submitCommand.mockReset();
      // Only the interval is faked — react-query and `waitFor` keep their
      // real `setTimeout`s.
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('"No projects" runs the scope refresh in the terminal and refetches', async () => {
      list.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });

      renderWithClient();
      expect(await screen.findByText('No projects')).toBeDefined();
      expect(list).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

      expect(submitCommand).toHaveBeenCalledWith('gh auth refresh -s project', 'gh');
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('keeps re-probing on an interval, and lands on the board list once it appears', async () => {
      list.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });

      renderWithClient();
      fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

      list.mockResolvedValue({
        cli: CLI_READY,
        projects: [{ id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://x', closed: false }],
        error: null,
        kind: 'ok',
      });
      vi.advanceTimersByTime(5000);

      await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
      expect(await screen.findByText('Pick a board')).toBeDefined();
      // The button unmounted with the empty state — its interval went with it.
      vi.advanceTimersByTime(60_000);
      expect(list).toHaveBeenCalledTimes(3);
      expect(submitCommand).toHaveBeenCalledTimes(1);
    });

    it('stops re-probing once the view unmounts', async () => {
      list.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });

      const { unmount } = renderWithClient();
      fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

      unmount();
      vi.advanceTimersByTime(5 * 60_000);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('"Could not load projects" offers the same Reload', async () => {
      list.mockResolvedValue({ cli: CLI_READY, projects: [], error: 'HTTP 401: Bad credentials', kind: 'ok' });

      renderWithClient();
      expect(await screen.findByText('Could not load projects')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

      expect(submitCommand).toHaveBeenCalledWith('gh auth refresh -s project', 'gh');
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('"Could not reach the GitHub CLI" runs the side-effect-free gh auth status instead', async () => {
      list.mockRejectedValue(new Error('spawn gh ENOENT'));

      renderWithClient();
      expect(await screen.findByText('Could not reach the GitHub CLI')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

      expect(submitCommand).toHaveBeenCalledWith('gh auth status', 'gh');
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });
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
            dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
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
            dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
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

    // Not `renderWithClient()`: this test needs the same `TasksView`
    // instance to persist across the mode flip (its lifted `selectedItemId`
    // is a `useState`), so it drives `render`/`rerender` on a freshly-built
    // tree each time — a *cached* element would let `QueryClientProvider`
    // bail out on referentially-equal props and never re-render `TasksView`
    // at all, exactly the trap `board-view.test.tsx`'s own `tree(...)`
    // function (not a plain constant) already avoids.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <ToastHost>
          <DialogHost>
            <TasksView />
          </DialogHost>
        </ToastHost>
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

  it('board mode\'s card-detail panel is resizable, and the dragged width survives a switch to graph mode', async () => {
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

    // Same `render`/`rerender` reasoning as the test above — the lifted
    // `cardPanelResizable` is `TasksView`'s own state, and this asserts it
    // survives a mode flip exactly as the shared `selectedItemId` does.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <ToastHost>
          <DialogHost>
            <TasksView />
          </DialogHost>
        </ToastHost>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());

    await screen.findByTestId('board-view');
    expect(screen.queryByRole('separator', { name: 'Resize task details' })).toBeNull();

    fireEvent.click(screen.getByText('The issue card'));
    const handle = await screen.findByRole('separator', { name: 'Resize task details' });
    const panel = screen.getByTestId('card-panel-stack');
    expect(panel.style.width).toBe('320px');

    // ArrowLeft grows the panel (edge: 'end') by 8px, same as graph mode.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle.getAttribute('aria-valuenow')).toBe('328');
    expect(panel.style.width).toBe('328px');

    projectsMode = { 'repo-1': 'graph' };
    rerender(tree());

    await screen.findByTestId('project-graph-view');
    const graphPanel = screen.getByTestId('card-panel-stack');
    expect(graphPanel.style.width).toBe('328px');
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

describe('Phase 75 Theme H — filters and the graph’s own facets', () => {
  beforeEach(() => {
    list.mockReset();
    fields.mockReset();
    items.mockReset();
    boardByRepo = { 'repo-1': 'PVT_1' };
    setProjectBoard.mockClear();
    forgeWritesEnabled = false;
    projectsMode = { 'repo-1': 'graph' };
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
            assignees: ['alice'],
            body: '',
            labels: [],
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
            assignees: ['bob'],
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
  });

  it('a node whose item the shared filter hid vanishes, taking its edge with it', async () => {
    projectViewByProject = {
      PVT_1: {
        ...DEFAULT_PROJECT_VIEW_MOCK,
        filter: { ...DEFAULT_PROJECT_VIEW_MOCK.filter, assignees: ['bob'] },
      },
    };
    const { container } = renderWithClient();

    expect(await screen.findByTestId('project-graph-view')).toBeDefined();
    expect(screen.getByText('The dependent')).toBeDefined();
    // The blocker's own item was filtered out — it must not survive as an
    // indistinguishable foreign node.
    expect(screen.queryByText('The blocker')).toBeNull();
    expect(container.querySelectorAll('[data-graph-node]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-edge-kind]')).toHaveLength(0);
  });

  it('shows the graph-only facet controls only in graph mode', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    expect(screen.getByLabelText('Show')).toBeDefined();
    expect(screen.getByLabelText('Depth from selection')).toBeDefined();
    expect(screen.getByText('Show sub-issues')).toBeDefined();
    expect(screen.getByText('Hide isolated')).toBeDefined();

    cleanup();
    projectsMode = { 'repo-1': 'table' };
    renderWithClient();
    // Table mode's virtualized rows don't render *in this file* — not
    // because jsdom cannot do it in general (Phase 82 Theme C's
    // `FiringResizeObserver` proves it can: `search-view.bridge.test.tsx`
    // asserts real virtualized row content), but because this file's own
    // `beforeAll` above deliberately overrides the global firing default
    // with a non-firing one, for reasons unrelated to this assertion. So
    // readiness here is still the toolbar itself, not row content — matching
    // the "Phase 52" describe block's own convention above — until Wave 2
    // migrates this file and removes that override.
    await screen.findByPlaceholderText('Search title, number or body…');

    expect(screen.queryByLabelText('Show')).toBeNull();
    expect(screen.queryByLabelText('Depth from selection')).toBeNull();
  });

  it('toggling "Hide isolated" persists the whole graph facets object (the shallow-merge trap)', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    fireEvent.click(screen.getByLabelText('Hide isolated'));

    expect(setProjectView).toHaveBeenCalledWith('PVT_1', {
      graph: { ...DEFAULT_GRAPH_FACETS_MOCK, hideIsolated: true },
    });
  });

  it('turning on a graph facet alone flips the shared filter-active indicator on', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');
    expect(screen.queryByTestId('projects-filter-active-indicator')).toBeNull();

    projectViewByProject = {
      PVT_1: { ...DEFAULT_PROJECT_VIEW_MOCK, graph: { ...DEFAULT_GRAPH_FACETS_MOCK, hideIsolated: true } },
    };
    cleanup();
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    expect(screen.getByTestId('projects-filter-active-indicator')).toBeDefined();
  });

  it('disables the depth selector until a node is selected, then enables it', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    const depth = screen.getByLabelText('Depth from selection') as HTMLSelectElement;
    expect(depth.disabled).toBe(true);

    fireEvent.click(screen.getByText('The blocker').closest('[data-graph-node]')!);

    expect((screen.getByLabelText('Depth from selection') as HTMLSelectElement).disabled).toBe(false);
  });

  it('changing "Show" persists the chosen value, preserving the other facets', async () => {
    projectViewByProject = {
      PVT_1: { ...DEFAULT_PROJECT_VIEW_MOCK, graph: { ...DEFAULT_GRAPH_FACETS_MOCK, showContains: true } },
    };
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'blocked' } });

    expect(setProjectView).toHaveBeenCalledWith('PVT_1', {
      graph: { ...DEFAULT_GRAPH_FACETS_MOCK, showContains: true, only: 'blocked' },
    });
  });

  it('renders a resizable handle and resizes the task details panel when nudged or reset', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    // No handle initially since nothing is selected
    expect(screen.queryByLabelText('Resize task details')).toBeNull();

    // Select a node
    fireEvent.click(screen.getByText('The blocker').closest('[data-graph-node]')!);

    // Handle is now mounted
    const handle = screen.getByRole('separator', { name: 'Resize task details' });
    expect(handle).toBeDefined();
    expect(handle.getAttribute('aria-valuenow')).toBe('320');
    expect(handle.getAttribute('aria-valuemin')).toBe('260');
    expect(handle.getAttribute('aria-valuemax')).toBe('640');

    // Panel is mounted with initial width
    const panel = screen.getByTestId('card-panel-stack');
    expect(panel.style.width).toBe('320px');

    // ArrowLeft grows the panel (because edge is 'end') by 8px
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle.getAttribute('aria-valuenow')).toBe('328');
    expect(panel.style.width).toBe('328px');

    // Double clicking handle resets to initial 320px
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute('aria-valuenow')).toBe('320');
    expect(panel.style.width).toBe('320px');
  });

  it('collapses the task details panel when nudged past min bound', async () => {
    renderWithClient();
    await screen.findByTestId('project-graph-view');

    fireEvent.click(screen.getByText('The blocker').closest('[data-graph-node]')!);
    const handle = screen.getByRole('separator', { name: 'Resize task details' });
    const panel = screen.getByTestId('card-panel-stack');

    // Home jumps to minimum (260px)
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(handle.getAttribute('aria-valuenow')).toBe('260');
    expect(panel.style.width).toBe('260px');

    // ArrowRight past min (with edge: 'end') triggers collapse
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    // onCollapse closed the panel by clearing selectedItemId
    expect(screen.queryByTestId('card-panel-stack')).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize task details' })).toBeNull();
  });
});

/*
  List (table) rows wear the same status stroke as a board card and a graph
  node (ad hoc) — as a left rule rather than an outline — and the same
  blocked rule: still and faded while an open blocker stands. Blocked comes
  from the one whole-board graph this view computes for every mode.
*/
describe('List view — status rule, blocked rows and the AI glow', () => {
  const STATUS_FIELD = {
    id: 'f-status',
    name: 'Status',
    dataType: 'single_select',
    options: [
      { id: 'o-todo', name: 'Todo', color: 'GRAY' },
      { id: 'o-rev', name: 'In Review', color: 'PURPLE' },
    ],
  };
  const row = (n: number, optionId: string, blockedBy: number[] = []) => ({
    id: `item${n}`,
    content: {
      type: 'issue',
      id: `I_${n}`,
      number: n,
      title: `Row ${n}`,
      url: `https://github.com/acme/widgets/issues/${n}`,
      state: 'open',
      assignees: [],
      body: '',
      labels: [],
      dependencies: {
        blockedBy: blockedBy.map((b) => ({ number: b, title: '', state: 'open', repo: '' })),
        parent: null,
        subIssues: [],
        blockedByTruncated: false,
        subIssuesTruncated: false,
      },
    },
    fieldValues: { 'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId, name: '' } },
  });

  beforeAll(() => {
    // The virtualizer sizes its window off the scroll element's offset box,
    // which jsdom reports as 0 — no rows would mount at all.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 });
  });

  beforeEach(() => {
    list.mockReset();
    fields.mockReset();
    items.mockReset();
    boardByRepo = { 'repo-1': 'PVT_1' };
    projectsMode = {};
    projectViewByProject = {};
    blockedByFieldName = 'Blocked by';
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });

    list.mockResolvedValue({
      cli: CLI_READY,
      projects: [{ id: 'PVT_1', number: 1, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/1', closed: false }],
      error: null,
      kind: 'ok',
    });
    fields.mockResolvedValue({ cli: CLI_READY, fields: [STATUS_FIELD], error: null, kind: 'ok' });
    items.mockResolvedValue({
      cli: CLI_READY,
      // Row 2 is blocked by the still-open row 1; row 3 stands alone.
      items: [row(1, 'o-rev'), row(2, 'o-rev', [1]), row(3, 'o-todo')],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });
  });

  async function rowEl(id: string): Promise<HTMLElement> {
    await screen.findByText('Row 1');
    return document.querySelector(`[data-project-row="${id}"]`) as HTMLElement;
  }

  it('an unblocked row: a left rule in its status colour and dash, marching', async () => {
    renderWithClient();
    const el = await rowEl('item1');
    expect(el.dataset.statusKind).toBe('inReview');
    expect(el.hasAttribute('data-blocked')).toBe(false);
    const line = el.querySelector('[data-status-border] line') as SVGLineElement;
    expect(line.getAttribute('stroke')).toBe('#A855F7');
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(line.getAttribute('stroke-opacity')).toBe('1');
    expect(line.getAttribute('class')).toContain('status-stroke-animated');
  });

  it('a blocked row keeps its colour and dash, but holds still and fades', async () => {
    renderWithClient();
    const el = await rowEl('item2');
    expect(el.hasAttribute('data-blocked')).toBe(true);
    const line = el.querySelector('[data-status-border] line') as SVGLineElement;
    expect(line.getAttribute('stroke')).toBe('#A855F7');
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(line.getAttribute('stroke-opacity')).toBe('0.55');
    expect(line.getAttribute('class')).not.toContain('status-stroke-animated');
  });

  it('a row with a live agent wears the one task glow in place of its rule', async () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'row',
      cwd: '/repo',
      repoId: 'repo-1',
      surface: 'kanban',
      taskRef: { projectId: 'PVT_1', itemId: 'item3' },
    });
    renderWithClient();
    const el = await rowEl('item3');
    await waitFor(() => expect(el.className).toContain('agent-run-glow task-glow'));
    expect(el.querySelector('[data-status-border]')).toBeNull();
    // The other rows keep their rules.
    expect(document.querySelector('[data-project-row="item1"] [data-status-border]')).not.toBeNull();
  });

  it("a row with a live agent shows the terminal list's avatar, in the agent's brand colour", async () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'row',
      cwd: '/repo',
      repoId: 'repo-1',
      surface: 'kanban',
      taskRef: { projectId: 'PVT_1', itemId: 'item3' },
    });
    renderWithClient();
    const el = await rowEl('item3');
    await waitFor(() => expect(el.querySelector('[data-agent-avatar="claude"]')).not.toBeNull());
    const ring = el.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.classList.contains('terminal-agent-glow')).toBe(true);
    // The roster this test's bridge returns (`accent: '#000'`), not the
    // builtin's: the colour comes from the same roster the terminal list reads.
    await waitFor(() => expect(ring.style.getPropertyValue('--agent-accent')).toBe('#000'));
    expect(document.querySelector('[data-project-row="item1"] [data-agent-avatar]')).toBeNull();
  });
});
