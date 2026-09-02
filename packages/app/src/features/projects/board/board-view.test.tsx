import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardView } from './board-view';

afterEach(cleanup);

// Only reached once a card opens `CardDetail`, which mutates through this.
vi.mock('../../../services/bridge', () => ({
  bridge: () => ({ forgeProject: { setField: vi.fn() } }),
}));
vi.mock('../../../store/ui-store', () => ({
  useUiStore: (selector: (state: { forgeWritesEnabled: boolean }) => unknown) =>
    selector({ forgeWritesEnabled: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [] },
  fieldValues: optionId
    ? { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name: optionId } }
    : {},
});

describe('BoardView', () => {
  it('shows a "no Status field" state when the project has no single_select Status field', () => {
    renderWithClient(<BoardView projectId="PVT_1" fields={[]} items={[item('i1', 'A task')]} />);
    expect(screen.getByText('No Status field')).toBeDefined();
  });

  it('shows a "no items" state when the board is empty', () => {
    renderWithClient(<BoardView projectId="PVT_1" fields={[statusField]} items={[]} />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('renders one column per option, plus No status, each with a live count', () => {
    renderWithClient(
      <BoardView
        projectId="PVT_1"
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
    renderWithClient(<BoardView projectId="PVT_1" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);
    expect(screen.getAllByText('Drop here').length).toBeGreaterThan(0);
  });

  it('collapsing a column hides its cards behind a rail showing just the count', () => {
    renderWithClient(<BoardView projectId="PVT_1" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Todo' }));

    expect(screen.queryByText('A task')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Todo' })).toBeDefined();
  });

  it('clicking a card opens its detail pane, and closing it clears the selection', () => {
    renderWithClient(<BoardView projectId="PVT_1" fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

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
    renderWithClient(<BoardView projectId="PVT_1" fields={[statusField]} items={many} />);

    expect(screen.getByText('60')).toBeDefined(); // the column's live count
  });
});
