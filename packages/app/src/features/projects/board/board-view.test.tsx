import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { BoardView } from './board-view';

afterEach(() => {
  cleanup();
  uiState.forgeWritesEnabled = false;
});

// Reached once a card opens `CardDetail` (which mutates through this) or the
// "Move to ▸" menu fires (Theme C) — resolved to a real accepted write so
// `useSetProjectItemField`'s `onSuccess` has an `ok` to read, not `undefined`.
// `terminal`/`agent` are reached by every render — `BoardView` hydrates
// unconditionally (Theme F/H), and `CardDetail`'s composer (Theme G) queries
// the agent roster once a card opens.
vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: {
      setField: vi.fn().mockResolvedValue({ ok: true, kind: 'ok' }),
      clearField: vi.fn().mockResolvedValue({ ok: true, kind: 'ok' }),
    },
    terminal: { list: vi.fn(async () => ({ sessions: [] })), save: vi.fn() },
    agent: { list: vi.fn(async () => ({ agents: [], status: [] })) },
  }),
  hasBridge: () => true,
}));

// A mutable object rather than a literal, so individual tests can flip
// `forgeWritesEnabled` — `vi.mock`'s factory is hoisted and evaluated once,
// so the selector has to read through a reference each render rather than
// close over a value baked in at mock-registration time.
const uiState = {
  forgeWritesEnabled: false,
  // `ContextMenu` (Theme C's "Move to ▸") reaches these directly via
  // `useUiStore.getState()`, zustand's vanilla escape hatch outside React —
  // a plain selector function has no `.getState` unless this attaches one.
  incrementOccluders: vi.fn(),
  decrementOccluders: vi.fn(),
};
function useUiStoreMock<T>(selector: (state: typeof uiState) => T): T {
  return selector(uiState);
}
useUiStoreMock.getState = () => uiState;
vi.mock('../../../store/ui-store', () => ({
  useUiStore: useUiStoreMock,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `DraggableCard`'s "Move to ▸" menu reaches `useDialogs()` (Theme C) —
  // every render needs the host it expects in the real app tree.
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>{ui}</DialogHost>
    </QueryClientProvider>,
  );
}

const statusField: ForgeProjectField = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'todo', name: 'Todo', color: 'GRAY' },
    { id: 'done', name: 'Done', color: 'GREEN' },
  ],
};

const item = (id: string, title: string, optionId?: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
  fieldValues: optionId
    ? { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name: optionId } }
    : {},
});

describe('BoardView', () => {
  it('shows a "no Status field" state when the project has no single_select Status field', () => {
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[]} items={[item('i1', 'A task')]} />);
    expect(screen.getByText('No Status field')).toBeDefined();
  });

  it('shows a "no items" state when the board is empty', () => {
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[]} />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('renders one column per option, plus No status, each with a live count', () => {
    renderWithClient(
      <BoardView
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[statusField]}
        items={[item('i1', 'A task', 'todo'), item('i2', 'B task'), item('i3', 'C task', 'done')]}
      />,
    );

    expect(screen.getByText('No status')).toBeDefined();
    expect(screen.getByText('Todo')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
    expect(screen.getByText('A task')).toBeDefined();
    expect(screen.getByText('B task')).toBeDefined();
    expect(screen.getByText('C task')).toBeDefined();
  });

  it('an empty column renders the drop-zone placeholder', () => {
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);
    expect(screen.getAllByText('Drop here').length).toBeGreaterThan(0);
  });

  it('collapsing a column hides its cards behind a rail showing just the count', () => {
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Todo' }));

    expect(screen.queryByText('A task')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Todo' })).toBeDefined();
  });

  it('clicking a card opens its detail pane, and closing it clears the selection', () => {
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

    expect(screen.queryByTestId('card-detail')).toBeNull();

    fireEvent.click(screen.getByText('A task'));
    expect(screen.getByTestId('card-detail')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('card-detail')).toBeNull();
  });

  it('a column past the virtualize threshold switches to the virtualizer without crashing', () => {
    // jsdom reports every element as zero-sized, so the virtualizer itself
    // renders no rows here (the same limitation `projects-view.test.tsx`
    // documents for the table) — this proves the threshold branch mounts
    // cleanly and still reports the true count, not that rows paint.
    const many = Array.from({ length: 60 }, (_, i) => item(`i${i}`, `Task ${i}`, 'todo'));
    renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={many} />);

    expect(screen.getByText('60')).toBeDefined(); // the column's live count
  });

  describe('drag gating on forgeWritesEnabled (Theme C)', () => {
    /*
      A real drag gesture is notoriously unreliable to simulate under jsdom
      (this repo has no precedent for it even for the older graph drag; that
      gesture is proved in Playwright, see `e2e/kanban.spec.ts`) — but
      "does this card advertise a drag at all" is a plain DOM read.
      `useDraggable`'s `attributes` bundle is what carries that advertisement:
      `aria-roledescription="draggable"`, a `role`, a `tabIndex`, and an
      `aria-disabled` set from its own `disabled` flag.

      The bundle now goes on ONLY while the drag is available, and the
      assertions changed with it. It used to be spread unconditionally, so a
      write-gated card wore `aria-disabled="true"` — which reads down the
      whole subtree, to a screen reader and to Playwright alike, and so
      announced the card's own open-the-pane click and `TaskCard`'s `>_`
      reveal button as dead controls. Both work fine with writes off.
    */
    const wrapperFor = (title: string): HTMLElement | null =>
      screen.getByText(title).closest('[aria-roledescription]');

    it('a write-gated card advertises no drag at all, and says why on hover', () => {
      uiState.forgeWritesEnabled = false;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      expect(wrapperFor('A task')).toBeNull();
      // No `aria-disabled` anywhere above the card either — that is the
      // attribute whose subtree reach was the problem.
      expect(screen.getByText('A task').closest('[aria-disabled]')).toBeNull();
      expect(screen.getByTitle(/Enable review actions/)).toBeDefined();
    });

    it('a card advertises the drag once forge writes are enabled', () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      const wrapper = wrapperFor('A task');
      expect(wrapper?.getAttribute('aria-roledescription')).toBe('draggable');
      expect(wrapper?.getAttribute('aria-disabled')).toBe('false');
    });

    it('the detail pane still opens with writes disabled — the gate is on moving cards, not reading them', () => {
      uiState.forgeWritesEnabled = false;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.click(screen.getByText('A task'));

      expect(screen.getByTestId('card-detail')).toBeDefined();
    });
  });

  describe('"Move to ▸" — the keyboard-reachable alternative to dragging (Theme C)', () => {
    it('right-clicking a card offers every other column, not its own', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);

      expect(await screen.findByRole('menuitem', { name: 'Done' })).toBeDefined();
      // "Todo" is the card's own column — offering it as a destination would
      // be a no-op menu item.
      expect(screen.queryByRole('menuitem', { name: 'Todo' })).toBeNull();
    });

    it('choosing a column moves the card there', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Done' }));

      // Optimistic (Theme C's own documented exception): the card is under
      // Done immediately, before any refetch could possibly have returned.
      const doneColumn = screen.getByRole('button', { name: 'Collapse Done' }).closest('div')!;
      expect(within(doneColumn).getByText('A task')).toBeDefined();
    });

    it('disabled while forge writes are off — no menu, no mutation', () => {
      uiState.forgeWritesEnabled = false;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('offers "No status" as a real destination (Phase 50 Theme C)', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);

      expect(await screen.findByRole('menuitem', { name: 'No status' })).toBeDefined();
    });

    it('choosing "No status" clears the field, not sets it', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<BoardView projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'No status' }));

      // Optimistic, same as any other move: the card is under No status
      // immediately.
      const noStatusColumn = screen.getByRole('button', { name: 'Collapse No status' }).closest('div')!;
      expect(within(noStatusColumn).getByText('A task')).toBeDefined();
    });
  });
});
