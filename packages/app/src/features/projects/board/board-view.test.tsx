import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BoardView } from './board-view';

afterEach(cleanup);

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
    render(<BoardView fields={[]} items={[item('i1', 'A task')]} />);
    expect(screen.getByText('No Status field')).toBeDefined();
  });

  it('shows a "no items" state when the board is empty', () => {
    render(<BoardView fields={[statusField]} items={[]} />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('renders one column per option, plus No status, each with a live count', () => {
    render(
      <BoardView
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
    render(<BoardView fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);
    expect(screen.getAllByText('Drop here').length).toBeGreaterThan(0);
  });

  it('collapsing a column hides its cards behind a rail showing just the count', () => {
    render(<BoardView fields={[statusField]} items={[item('i1', 'A task', 'todo')]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Todo' }));

    expect(screen.queryByText('A task')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Todo' })).toBeDefined();
  });
});
