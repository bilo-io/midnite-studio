import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardDetail } from './card-detail';

afterEach(cleanup);

const setField = vi.fn();
vi.mock('../../../services/bridge', () => ({
  bridge: () => ({ forgeProject: { setField } }),
}));

let forgeWritesEnabled = true;
vi.mock('../../../store/ui-store', () => ({
  useUiStore: (selector: (state: { forgeWritesEnabled: boolean }) => unknown) =>
    selector({ forgeWritesEnabled }),
}));

const statusField: ForgeProjectField = {
  id: 'f-status',
  name: 'Status',
  dataType: 'single_select',
  options: [{ id: 'todo', name: 'Todo', color: 'GRAY' }],
};
const priorityField: ForgeProjectField = { id: 'f-priority', name: 'Priority', dataType: 'text' };

const item: ForgeProjectItem = {
  id: 'item1',
  content: {
    type: 'issue',
    id: 'I_1',
    number: 42,
    title: 'Fix the flaky test',
    url: 'https://github.com/acme/widgets/issues/42',
    state: 'open',
    assignees: ['octocat'],
  },
  fieldValues: {
    'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId: 'todo', name: 'Todo' },
    'f-priority': { fieldId: 'f-priority', dataType: 'text', text: 'High' },
  },
};

function renderDetail(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardDetail projectId="PVT_1" item={item} fields={[statusField, priorityField]} onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('CardDetail', () => {
  beforeEach(() => {
    setField.mockReset();
    forgeWritesEnabled = true;
  });

  it('renders the title, the number linked to github.com, and assignees', () => {
    renderDetail();

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
    expect(screen.getByText('octocat')).toBeDefined();
  });

  it('renders every field, editable through the same editor the table uses', () => {
    renderDetail();

    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: 'Priority' }) as HTMLInputElement).value).toBe('High');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderDetail(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
