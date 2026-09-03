import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { CardPanelStack } from './card-panel-stack';

afterEach(cleanup);

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { setField: vi.fn() },
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

function Harness({
  selectedItemId,
  items: itemsProp = items,
  onSelectItem = vi.fn(),
  onClose = vi.fn(),
}: {
  selectedItemId: string;
  items?: ForgeProjectItem[];
  onSelectItem?: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <CardPanelStack
      projectId="PVT_1"
      repoId="repo-1"
      worktreePath="/repo/widgets"
      items={itemsProp}
      fields={fields}
      selectedItemId={selectedItemId}
      onSelectItem={onSelectItem}
      onClose={onClose}
    />
  );
}

function renderStack(props: Parameters<typeof Harness>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <Harness {...props} />
      </DialogHost>
    </QueryClientProvider>,
  );
  return {
    ...utils,
    rerenderWith: (next: Parameters<typeof Harness>[0]) =>
      utils.rerender(
        <QueryClientProvider client={queryClient}>
          <DialogHost>
            <Harness {...next} />
          </DialogHost>
        </QueryClientProvider>,
      ),
  };
}

describe('CardPanelStack', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('renders the selected card and disables Back on first open', () => {
    renderStack({ selectedItemId: cardA.id });

    expect(screen.getByTestId('card-detail')).toBeDefined();
    expect(screen.getAllByText('Card A').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });

  it('pushes a new history entry when a different card is selected, buying Back to the prior one', () => {
    const { rerenderWith } = renderStack({ selectedItemId: cardA.id });

    rerenderWith({ selectedItemId: cardB.id });

    // Breadcrumb now carries both cards, current one last.
    expect(screen.getAllByText('Card A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Card B').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', false);
  });

  it('re-selecting the already-open card is a no-op — Back stays disabled', () => {
    const { rerenderWith } = renderStack({ selectedItemId: cardA.id });

    rerenderWith({ selectedItemId: cardA.id });

    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });

  it('resets CardComposer state per card — a prompt edited on card A does not bleed into card B', () => {
    const { rerenderWith } = renderStack({ selectedItemId: cardA.id });

    const prompt = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'a note only relevant to card A' } });
    expect(prompt.value).toBe('a note only relevant to card A');

    rerenderWith({ selectedItemId: cardB.id });

    // `.at(-1)`: the transition briefly mounts both the outgoing and
    // incoming pane (see the sibling `.last()` note in `kanban.spec.ts`) —
    // the incoming one is the later sibling.
    const promptForB = screen.getAllByLabelText('Prompt').at(-1) as HTMLTextAreaElement;
    expect(promptForB.value).not.toContain('a note only relevant to card A');
  });

  it('reports a Back navigation back up to the board, so its own selection state stays in sync', () => {
    const onSelectItem = vi.fn();
    const { rerenderWith } = renderStack({ selectedItemId: cardA.id, onSelectItem });
    rerenderWith({ selectedItemId: cardB.id, onSelectItem });
    onSelectItem.mockClear();

    fireEvent.click(screen.getByLabelText('Back'));

    expect(onSelectItem).toHaveBeenCalledWith(cardA.id);
  });

  it('closes the pane instead of rendering blank when the current entry drops out of `items`', () => {
    const onClose = vi.fn();
    renderStack({ selectedItemId: 'gone', items: [], onClose });

    expect(onClose).toHaveBeenCalled();
  });
});
