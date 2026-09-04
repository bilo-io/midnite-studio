import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useTerminalStore } from '../../terminal/terminal-store';
import { BoardView } from './board-view';
import { resolveGroupField } from './resolve-group-field';

/** jsdom implements no `CSS` global at all — `board-view.tsx`'s
 *  `moveFocusTo` reads `CSS.escape` to build its `data-card-id` selector. */
beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') });
});

/**
 * `BoardView` no longer resolves its own grouping field or owns collapse
 * state (Phase 52 Themes B/D lifted both to the caller, so they can be
 * persisted). This is that caller, standing in for `ProjectsView`: it
 * resolves the field the same way `resolveGroupField` always does (`Status`
 * by default) and keeps collapse state exactly the way `BoardView` itself
 * used to, so every pre-existing test below still exercises real behaviour
 * rather than a mock of it.
 */
function Harness({
  fields,
  groupFieldId = null,
  ...rest
}: Omit<
  React.ComponentProps<typeof BoardView>,
  'groupField' | 'collapsedColumns' | 'onToggleColumn' | 'onExpandColumn'
> & { groupFieldId?: string | null }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  return (
    <BoardView
      {...rest}
      fields={fields}
      groupField={resolveGroupField(fields, groupFieldId)}
      collapsedColumns={collapsed}
      onToggleColumn={(id) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onExpandColumn={(id) => setCollapsed((prev) => (prev.has(id) ? new Set([...prev].filter((v) => v !== id)) : prev))}
    />
  );
}

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
  it('shows a "no groupable field" state when the project has no single_select or iteration field', () => {
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[]} items={[item('i1', 'A task')]} />);
    expect(screen.getByText('No groupable field')).toBeDefined();
  });

  it('shows a "no items" state when the board is empty', () => {
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[]} />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('renders one column per option, plus No Status, each with a live count', () => {
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[statusField]}
        items={[item('i1', 'A task', 'todo'), item('i2', 'B task'), item('i3', 'C task', 'done')]}
      />,
    );

    // Generalised off the field's own name (Phase 52 Theme B) — "No Status",
    // not the hardcoded "No status" this used to be.
    expect(screen.getByText('No Status')).toBeDefined();
    expect(screen.getByText('Todo')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
    expect(screen.getByText('A task')).toBeDefined();
    expect(screen.getByText('B task')).toBeDefined();
    expect(screen.getByText('C task')).toBeDefined();
  });

  it('an empty column renders the drop-zone placeholder', () => {
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);
    expect(screen.getAllByText('Drop here').length).toBeGreaterThan(0);
  });

  it('collapsing a column hides its cards behind a rail showing just the count', () => {
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Todo' }));

    expect(screen.queryByText('A task')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Todo' })).toBeDefined();
  });

  it('clicking a card opens its detail pane, and closing it clears the selection', () => {
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

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
    renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={many} />);

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
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      expect(wrapperFor('A task')).toBeNull();
      // No `aria-disabled` anywhere above the card either — that is the
      // attribute whose subtree reach was the problem.
      expect(screen.getByText('A task').closest('[aria-disabled]')).toBeNull();
      expect(screen.getByTitle(/Enable review actions/)).toBeDefined();
    });

    it('a card advertises the drag once forge writes are enabled', () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      const wrapper = wrapperFor('A task');
      expect(wrapper?.getAttribute('aria-roledescription')).toBe('draggable');
      expect(wrapper?.getAttribute('aria-disabled')).toBe('false');
    });

    it('the detail pane still opens with writes disabled — the gate is on moving cards, not reading them', () => {
      uiState.forgeWritesEnabled = false;
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.click(screen.getByText('A task'));

      expect(screen.getByTestId('card-detail')).toBeDefined();
    });
  });

  describe('"Move to ▸" — the keyboard-reachable alternative to dragging (Theme C)', () => {
    it('right-clicking a card offers every other column, not its own', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

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
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

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
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('offers "No Status" as a real destination (Phase 50 Theme C)', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);

      expect(await screen.findByRole('menuitem', { name: 'No Status' })).toBeDefined();
    });

    it('choosing "No Status" clears the field, not sets it', async () => {
      uiState.forgeWritesEnabled = true;
      renderWithClient(<Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

      fireEvent.contextMenu(screen.getByText('A task'));
      const moveTo = await screen.findByRole('menuitem', { name: 'Move to' });
      fireEvent.mouseEnter(moveTo.closest('div')!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'No Status' }));

      // Optimistic, same as any other move: the card is under No Status
      // immediately.
      const noStatusColumn = screen.getByRole('button', { name: 'Collapse No Status' }).closest('div')!;
      expect(within(noStatusColumn).getByText('A task')).toBeDefined();
    });
  });

  describe('switching boards does not kill a running session (Theme H)', () => {
    // `hydrated: true` short-circuits `BoardView`'s own `hydrate()` call —
    // otherwise it would race this seed with a `terminal.list()` resolution
    // that merges in an empty session list.
    const seedKanbanSession = (id: string, taskRef: { projectId: string; itemId: string }) =>
      useTerminalStore.setState((state) => ({
        hydrated: true,
        sessions: [
          ...state.sessions,
          {
            id,
            kind: 'shell',
            title: 'Task',
            cwd: '/repo',
            repoId: 'repo-1',
            createdAt: Date.now(),
            surface: 'kanban',
            taskRef,
          },
        ],
      }));

    afterEach(() => {
      useTerminalStore.setState({ sessions: [], hydrated: false });
    });

    it("leaves another board's session alone, and mounting/unmounting this one does not kill it", () => {
      seedKanbanSession('s-other-board', { projectId: 'PVT_2', itemId: 'i9' });

      const { unmount } = renderWithClient(
        <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />,
      );

      // Reconciliation is scoped to `board.projectId` — a session bound to a
      // *different* board's card is not touched just because this board mounted.
      expect(useTerminalStore.getState().sessions.find((s) => s.id === 's-other-board')?.taskRef).toEqual({
        projectId: 'PVT_2',
        itemId: 'i9',
      });

      unmount();

      // Switching away (unmounting this board) does not kill a session
      // belonging to another one — nothing here targets it on unmount, and
      // the session lives in the store, outside this component's lifecycle.
      const stillThere = useTerminalStore.getState().sessions.find((s) => s.id === 's-other-board');
      expect(stillThere).toBeDefined();
      expect(stillThere?.surface).toBe('kanban');
    });

    it("a card's own session survives its board being closed, and reattaches on reopen", () => {
      seedKanbanSession('s-this-board', { projectId: 'PVT_1', itemId: 'i1' });

      const { unmount } = renderWithClient(
        <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />,
      );
      unmount();

      // Board closed (e.g. the user switched projects) — the session is
      // hidden, not rehomed or killed just because its board unmounted.
      const whileClosed = useTerminalStore.getState().sessions.find((s) => s.id === 's-this-board');
      expect(whileClosed?.surface).toBe('kanban');
      expect(whileClosed?.taskRef).toEqual({ projectId: 'PVT_1', itemId: 'i1' });

      renderWithClient(
        <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />,
      );

      // Reopening the same board reattaches: the item is still on the board,
      // so the session's binding is left exactly as it was, not orphaned.
      const afterReopen = useTerminalStore.getState().sessions.find((s) => s.id === 's-this-board');
      expect(afterReopen?.taskRef).toEqual({ projectId: 'PVT_1', itemId: 'i1' });
    });
  });
});

describe('grouping by an iteration field is read-only (Phase 52 Theme B)', () => {
  const sprintField: ForgeProjectField = { id: 'f-sprint', name: 'Sprint', dataType: 'iteration' };
  const sprintItem = (id: string, title: string, iterationId?: string): ForgeProjectItem => ({
    id,
    content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
    fieldValues: iterationId
      ? { 'f-sprint': { fieldId: 'f-sprint', dataType: 'iteration', iterationId, title: iterationId } }
      : {},
  });

  it('renders columns discovered from the items, grouped by the iteration field', () => {
    uiState.forgeWritesEnabled = true;
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[sprintField]}
        groupFieldId="f-sprint"
        items={[sprintItem('i1', 'A task', 'sprint-1')]}
      />,
    );
    expect(screen.getByText('sprint-1')).toBeDefined();
    expect(screen.getByText('A task')).toBeDefined();
  });

  it('a card advertises no drag at all, even with forge writes enabled', () => {
    uiState.forgeWritesEnabled = true;
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[sprintField]}
        groupFieldId="f-sprint"
        items={[sprintItem('i1', 'A task', 'sprint-1')]}
      />,
    );

    expect(screen.getByText('A task').closest('[aria-roledescription]')).toBeNull();
    expect(screen.getByTitle(/is read-only/)).toBeDefined();
  });

  it('right-clicking a card opens no "Move to ▸" menu', () => {
    uiState.forgeWritesEnabled = true;
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[sprintField]}
        groupFieldId="f-sprint"
        items={[sprintItem('i1', 'A task', 'sprint-1')]}
      />,
    );

    fireEvent.contextMenu(screen.getByText('A task'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

/**
 * The board's keyboard navigation (Phase 52 Theme G) — roving tabindex, so
 * the board costs one Tab press to enter and arrow keys to traverse, not one
 * Tab press per card. `board-keyboard.test.ts` covers the underlying
 * arithmetic (`moveVertical`/`moveHorizontal`/`nearestCardId`) in isolation;
 * these are the doc's own named behaviours, at the layer that actually shows
 * them — real DOM focus on a real `BoardView`.
 */
describe('board keyboard navigation (Phase 52 Theme G)', () => {
  const cardEl = (title: string): HTMLElement =>
    screen.getByText(title).closest('[data-card-id]') as HTMLElement;

  it('roving tabindex: only the focused card is a Tab stop, and arrow keys move it', () => {
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[statusField]}
        items={[
          item('i1', 'Todo A', 'todo'),
          item('i2', 'Todo B', 'todo'),
          item('i3', 'Done A', 'done'),
        ]}
      />,
    );

    const todoA = cardEl('Todo A');
    const todoB = cardEl('Todo B');
    const doneA = cardEl('Done A');

    // Seeded to the first card without anyone pressing a key yet — the
    // board's one Tab stop, not zero.
    expect(todoA.getAttribute('tabindex')).toBe('0');
    expect(todoB.getAttribute('tabindex')).toBe('-1');
    expect(doneA.getAttribute('tabindex')).toBe('-1');

    todoA.focus();
    fireEvent.keyDown(todoA, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(todoB);
    expect(todoB.getAttribute('tabindex')).toBe('0');
    expect(todoA.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(todoB, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(doneA);
    expect(doneA.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(doneA, { key: 'ArrowUp' });
    // Clamped, not wrapped — there is no row above the first in this column.
    expect(document.activeElement).toBe(doneA);
  });

  it('a collapsed column is skipped by ←/→, never a focus stop with nothing on it', () => {
    const threeColumnField: ForgeProjectField = {
      id: 'f1',
      name: 'Status',
      dataType: 'single_select',
      options: [
        { id: 'todo', name: 'Todo', color: 'GRAY' },
        { id: 'doing', name: 'Doing', color: 'YELLOW' },
        { id: 'done', name: 'Done', color: 'GREEN' },
      ],
    };
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[threeColumnField]}
        items={[item('i1', 'Todo A', 'todo'), item('i2', 'Doing A', 'doing'), item('i3', 'Done A', 'done')]}
      />,
    );

    // Collapse the middle column — the one directly between the focused
    // card and its target — before any arrow key is pressed, so it is
    // already in the way rather than disappearing out from under focus.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Doing' }));

    const todoA = cardEl('Todo A');
    todoA.focus();
    fireEvent.keyDown(todoA, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(cardEl('Done A'));
  });

  it('collapsing the focused card\'s own column rescues focus to the nearest navigable card', () => {
    renderWithClient(
      <Harness
        projectId="PVT_1" repoId="repo-1" worktreePath="/repo"
        fields={[statusField]}
        items={[item('i1', 'Todo A', 'todo'), item('i2', 'Done A', 'done')]}
      />,
    );

    cardEl('Todo A').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Todo' }));

    // The card's own DOM node is gone the instant its column collapses — the
    // roving target moves off it without anyone pressing an arrow key.
    expect(screen.queryByText('Todo A')).toBeNull();
    expect(cardEl('Done A').getAttribute('tabindex')).toBe('0');
  });

  it('Enter opens the focused card into the detail pane', () => {
    renderWithClient(
      <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />,
    );

    const card = cardEl('A task');
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(screen.getByTestId('card-detail')).toBeDefined();
  });

  it('Escape closes the detail pane and returns focus to the card it came from', () => {
    renderWithClient(
      <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />,
    );

    const card = cardEl('A task');
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(screen.getByTestId('card-detail')).toBeDefined();

    fireEvent.keyDown(screen.getByTestId('board-view'), { key: 'Escape' });

    expect(screen.queryByTestId('card-detail')).toBeNull();
    expect(document.activeElement).toBe(cardEl('A task'));
  });

  it('focus is rescued to the nearest remaining card when the focused one is filtered out', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (items: ForgeProjectItem[]) => (
      <QueryClientProvider client={queryClient}>
        <DialogHost>
          <Harness projectId="PVT_1" repoId="repo-1" worktreePath="/repo" fields={[statusField]} items={items} />
        </DialogHost>
      </QueryClientProvider>
    );

    const { rerender } = render(
      tree([item('i1', 'Todo A', 'todo'), item('i2', 'Todo B', 'todo'), item('i3', 'Done A', 'done')]),
    );

    cardEl('Todo A').focus();
    fireEvent.keyDown(cardEl('Todo A'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cardEl('Todo B'));

    // Simulate the caller applying a filter that removes "Todo B" — the
    // prop change alone, no key press, is what must trigger the rescue.
    rerender(tree([item('i1', 'Todo A', 'todo'), item('i3', 'Done A', 'done')]));

    expect(screen.queryByText('Todo B')).toBeNull();
    // "Todo B" was the second (index 1) of three flattened cards; the same
    // flattened index in the two-card board that's left is "Done A".
    expect(cardEl('Done A').getAttribute('tabindex')).toBe('0');
  });
});
