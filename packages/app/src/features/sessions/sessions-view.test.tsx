import type { ClosedSession } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { SessionsView } from './sessions-view';

const historyResult = vi.fn();
const refresh = vi.fn();
vi.mock('../../services/queries', () => ({
  useSessionHistory: () => historyResult(),
  useRefreshSessionHistory: () => refresh,
}));

vi.mock('../terminal/use-agents', () => ({
  useAgents: () => ({ agents: [] }),
}));

// Real `TranscriptView` needs xterm and a bridge of its own — out of scope
// for this view's own test, which is the list, the facet and the purge flow.
vi.mock('./transcript-view', () => ({
  TranscriptView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="transcript">{sessionId}</div>
  ),
}));

const purge = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/bridge', () => ({
  bridge: () => ({ sessions: { purge } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function closedSession(
  overrides: Partial<ClosedSession> &
    Pick<ClosedSession, 'id' | 'repoId' | 'title' | 'createdAt' | 'closedAt'>,
): ClosedSession {
  return {
    kind: 'shell',
    cwd: '/repo',
    exitCode: null,
    reason: 'closed',
    transcriptBytes: 0,
    ...overrides,
  };
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <SessionsView />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('SessionsView', () => {
  it('renders rows newest-first, grouped by repo', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'first', createdAt: 1000, closedAt: 2000 }),
        closedSession({ id: 'b', repoId: 'r1', title: 'repo-one', name: 'second', createdAt: 1000, closedAt: 3000 }),
        closedSession({ id: 'c', repoId: 'r2', title: 'repo-two', name: 'third', createdAt: 1000, closedAt: 5000 }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const list = screen.getByRole('list', { name: 'Closed sessions' });
    const rows = within(list).getAllByRole('button', { name: /first|second|third/ });
    // r2 (newest member closedAt=5000) sorts its group ahead of r1; within
    // r1, 'second' (3000) sorts ahead of 'first' (2000).
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('third'),
      expect.stringContaining('second'),
      expect.stringContaining('first'),
    ]);
  });

  it('narrows to one reason via the facet', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'ended-clean', createdAt: 1000, closedAt: 2000, reason: 'closed' }),
        closedSession({ id: 'b', repoId: 'r1', title: 'repo-one', name: 'crashed', createdAt: 1000, closedAt: 3000, reason: 'exited' }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    expect(screen.getByText(/ended-clean/)).toBeTruthy();
    expect(screen.getByText(/crashed/)).toBeTruthy();

    // The trigger's accessible name is its own text (`allLabel` with nothing
    // selected) — `label` becomes the opened listbox's `aria-label`, not the
    // button's name.
    fireEvent.click(screen.getByRole('button', { name: 'All endings' }));
    fireEvent.click(screen.getByRole('option', { name: 'Exited' }));

    expect(screen.queryByText(/ended-clean/)).toBeNull();
    expect(screen.getByText(/crashed/)).toBeTruthy();
  });

  it('renders three distinct labels for three sessions closed in one repo', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'alpha', createdAt: 1000, closedAt: 2000 }),
        closedSession({ id: 'b', repoId: 'r1', title: 'repo-one', name: 'bravo', createdAt: 1000, closedAt: 3000 }),
        closedSession({ id: 'c', repoId: 'r1', title: 'repo-one', name: 'charlie', createdAt: 1000, closedAt: 4000 }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    expect(screen.getByText(/alpha/)).toBeTruthy();
    expect(screen.getByText(/bravo/)).toBeTruthy();
    expect(screen.getByText(/charlie/)).toBeTruthy();
  });

  it('renders EmptyState, not a skeleton, once an empty fetch resolves', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });

    renderView();

    expect(screen.getByText('No closed sessions')).toBeTruthy();
    expect(screen.queryByText('Loading closed sessions…')).toBeNull();
  });

  it('shows the skeleton while genuinely nothing has arrived yet', () => {
    historyResult.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderView();

    expect(screen.getByText('Loading closed sessions…')).toBeTruthy();
  });

  it('purges one session only after the confirm dialog is accepted', async () => {
    historyResult.mockReturnValue({
      data: [closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'only', createdAt: 1000, closedAt: 2000 })],
      isPending: false,
      isError: false,
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Purge session' }));
    expect(purge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Purge' }));

    await waitFor(() => expect(purge).toHaveBeenCalledWith({ sessionId: 'a' }));
    expect(refresh).toHaveBeenCalled();
  });
});
