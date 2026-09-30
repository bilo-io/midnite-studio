import type { ForgeIssue } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { openIssueModal, useIssueModalStore } from '../../../store/issue-modal-store';
import { IssueModalHost } from './issue-modal';

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      issueDetail: vi.fn(() => new Promise(() => {})),
      issueComments: vi.fn(() => new Promise(() => {})),
      issueComment: vi.fn(),
      issueSetState: vi.fn(),
    },
    forgeProject: { list: vi.fn(() => new Promise(() => {})), addItem: vi.fn() },
  }),
  hasBridge: () => true,
}));

const seed: ForgeIssue = {
  id: '',
  number: 42,
  title: 'Seeded title',
  state: 'open',
  author: 'bilo',
  labels: [],
  assignees: [],
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: null,
  url: 'https://github.com/o/r/issues/42',
  milestone: null,
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DialogHost>
        <IssueModalHost />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('IssueModalHost', () => {
  afterEach(() => {
    cleanup();
    useIssueModalStore.setState({ target: null });
  });

  it('renders nothing until an issue is opened, then shows it and closes on Escape', () => {
    mount();
    expect(screen.queryByTestId('issue-modal')).toBeNull();
    act(() => openIssueModal({ repoId: 'r1', number: 42, seed }));
    expect(screen.getByTestId('issue-modal')).toBeTruthy();
    expect(screen.getByText('Seeded title')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useIssueModalStore.getState().target).toBeNull();
  });
});
