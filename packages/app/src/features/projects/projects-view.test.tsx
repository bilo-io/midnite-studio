import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectFieldCell, ProjectsView } from './projects-view';

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

vi.mock('../../store/ui-store', () => ({
  useUiStore: (
    selector: (state: {
      projectBoardByRepo: Record<string, string>;
      setProjectBoard: typeof setProjectBoard;
      forgeWritesEnabled: boolean;
    }) => unknown,
  ) => selector({ projectBoardByRepo: boardByRepo, setProjectBoard, forgeWritesEnabled }),
}));

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectsView />
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

});

/* Phase 40 Theme E's own acceptance test, verbatim from the doc. Rendered on
   its own rather than through the virtualized table — jsdom reports every
   element as zero-sized, so the virtualizer renders no rows at all. */
describe('ProjectFieldCell', () => {
  beforeEach(() => {
    setField.mockReset();
    forgeWritesEnabled = false;
  });
  afterEach(cleanup);

  it('with forgeWritesEnabled off, a text field renders disabled and no mutation is issued', () => {
    forgeWritesEnabled = false;
    const field = { id: 'f1', name: 'Status', dataType: 'text' as const };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={undefined} />
      </QueryClientProvider>,
    );

    const editor = screen.getByRole('textbox', { name: 'Status' }) as HTMLInputElement;
    expect(editor.disabled).toBe(true);
    expect(editor.title).toBe('Enable review actions in Settings → Reviews');
    expect(setField).not.toHaveBeenCalled();
  });

  it('with forgeWritesEnabled on, editing a text field commits on blur', async () => {
    forgeWritesEnabled = true;
    setField.mockResolvedValue({ ok: true, kind: 'ok' });
    const field = { id: 'f1', name: 'Status', dataType: 'text' as const };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={undefined} />
      </QueryClientProvider>,
    );

    const editor = screen.getByRole('textbox', { name: 'Status' }) as HTMLInputElement;
    expect(editor.disabled).toBe(false);

    fireEvent.change(editor, { target: { value: 'Done' } });
    fireEvent.blur(editor);

    await waitFor(() =>
      expect(setField).toHaveBeenCalledWith({
        projectId: 'PVT_1',
        itemId: 'item1',
        fieldId: 'f1',
        value: { fieldId: 'f1', dataType: 'text', text: 'Done' },
      }),
    );
  });
});
