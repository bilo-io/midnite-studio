import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { CardPanelStack } from './card-panel-stack';

afterEach(cleanup);

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { setField: vi.fn() },
    terminal: { list: vi.fn(async () => ({ sessions: [] })), save: vi.fn() },
    agent: { list: vi.fn(async () => ({ agents: [], status: [] })) },
  }),
  hasBridge: () => true,
}));

vi.mock('../../../store/ui-store', () => ({
  useUiStore: (selector: (state: { forgeWritesEnabled: boolean }) => unknown) =>
    selector({ forgeWritesEnabled: true }),
}));

const fields: ForgeProjectField[] = [];

function itemFor(id: string, title: string): ForgeProjectItem {
  return {
    id,
    content: {
      type: 'issue',
      id: `content-${id}`,
      number: 1,
      title,
      url: `https://github.com/acme/widgets/issues/${id}`,
      state: 'open',
      assignees: [],
      body: '',
      labels: [],
    },
    fieldValues: {},
  };
}

const cardA = itemFor('a', 'Card A');
const cardB = itemFor('b', 'Card B');
const items = [cardA, cardB];

function renderStack(selectedItemId: string, onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <CardPanelStack
          projectId="PVT_1"
          repoId="repo-1"
          worktreePath="/repo/widgets"
          items={items}
          fields={fields}
          selectedItemId={selectedItemId}
          onClose={onClose}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient, onClose };
}

describe('CardPanelStack', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('renders the selected card and disables Back on first open', () => {
    renderStack(cardA.id);

    expect(screen.getByTestId('card-detail')).toBeDefined();
    expect(screen.getAllByText('Card A').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });

  it('pushes a new history entry when a different card is selected, buying Back to the prior one', () => {
    const { rerender, queryClient, onClose } = renderStack(cardA.id);

    rerender(
      <QueryClientProvider client={queryClient}>
        <DialogHost>
          <CardPanelStack
            projectId="PVT_1"
            repoId="repo-1"
            worktreePath="/repo/widgets"
            items={items}
            fields={fields}
            selectedItemId={cardB.id}
            onClose={onClose}
          />
        </DialogHost>
      </QueryClientProvider>,
    );

    // Breadcrumb now carries both cards, current one last.
    expect(screen.getAllByText('Card A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Card B').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', false);
  });

  it('re-selecting the already-open card is a no-op — Back stays disabled', () => {
    const { rerender, queryClient, onClose } = renderStack(cardA.id);

    rerender(
      <QueryClientProvider client={queryClient}>
        <DialogHost>
          <CardPanelStack
            projectId="PVT_1"
            repoId="repo-1"
            worktreePath="/repo/widgets"
            items={items}
            fields={fields}
            selectedItemId={cardA.id}
            onClose={onClose}
          />
        </DialogHost>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });
});
