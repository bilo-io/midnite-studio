import type { ClosedSession, TerminalSession } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useTerminalStore } from '../terminal/terminal-store';
import { SessionsView } from './sessions-view';

import { BUILTIN_AGENTS } from '@midnite/studio-shared';

const historyResult = vi.fn();
const refresh = vi.fn();
vi.mock('../../services/queries', () => ({
  useSessionHistory: () => historyResult(),
  useRefreshSessionHistory: () => refresh,
}));

vi.mock('../terminal/use-agents', () => ({
  useAgents: () => ({ agents: [...BUILTIN_AGENTS] }),
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
  // The store is a module-level singleton — reset the three fields this
  // view reads so one test's live session never bleeds into the next.
  useTerminalStore.setState({ sessions: [], states: {}, activity: {} });
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

function liveSession(
  overrides: Partial<TerminalSession> & Pick<TerminalSession, 'id' | 'repoId' | 'title' | 'createdAt'>,
): TerminalSession {
  return {
    kind: 'shell',
    cwd: '/repo',
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

    const list = screen.getByRole('list', { name: 'Sessions' });
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

    expect(screen.getByText('Nothing running, nothing closed')).toBeTruthy();
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

  it('renders provider icon in brand accent color', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 'claude-s1',
          repoId: 'r1',
          title: 'repo-one',
          kind: 'agent',
          agentId: 'claude',
          createdAt: 1000,
          closedAt: 2000,
        }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const row = screen.getByRole('button', { name: /Claude/ });
    const svg = row.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('style')).toContain('color: rgb(217, 119, 87)');
  });

  it('defaults non-agent sessions to terminal icon with muted styling', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 'term-s1',
          repoId: 'r1',
          title: 'repo-one',
          name: 'shell-session',
          kind: 'shell',
          createdAt: 1000,
          closedAt: 2000,
        }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const row = screen.getByRole('button', { name: /shell-session/ });
    const svg = row.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('class')).toContain('text-muted-foreground');
    expect(svg?.getAttribute('style')).toBeNull();
  });

  it('filters sessions by provider multiselect', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 's1',
          repoId: 'r1',
          title: 'repo-one',
          name: 'claude-run',
          kind: 'agent',
          agentId: 'claude',
          createdAt: 1000,
          closedAt: 2000,
        }),
        closedSession({
          id: 's2',
          repoId: 'r1',
          title: 'repo-one',
          name: 'codex-run',
          kind: 'agent',
          agentId: 'codex',
          createdAt: 1000,
          closedAt: 3000,
        }),
        closedSession({
          id: 's3',
          repoId: 'r1',
          title: 'repo-one',
          name: 'terminal-run',
          kind: 'shell',
          createdAt: 1000,
          closedAt: 4000,
        }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    expect(screen.getByText(/claude-run/)).toBeTruthy();
    expect(screen.getByText(/codex-run/)).toBeTruthy();
    expect(screen.getByText(/terminal-run/)).toBeTruthy();

    // Open provider filter
    fireEvent.click(screen.getByRole('button', { name: 'All providers' }));
    // Filter to Claude only
    fireEvent.click(screen.getByRole('option', { name: /Claude/ }));

    expect(screen.getByText(/claude-run/)).toBeTruthy();
    expect(screen.queryByText(/codex-run/)).toBeNull();
    expect(screen.queryByText(/terminal-run/)).toBeNull();

    // Add Codex as well
    fireEvent.click(screen.getByRole('option', { name: /Codex/ }));
    expect(screen.getByText(/claude-run/)).toBeTruthy();
    expect(screen.getByText(/codex-run/)).toBeTruthy();
    expect(screen.queryByText(/terminal-run/)).toBeNull();
  });

  it('filters sessions by search query across label and repo name', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'midnite-studio', name: 'fix-flake', createdAt: 1000, closedAt: 2000 }),
        closedSession({ id: 'b', repoId: 'r2', title: 'ekko-api', name: 'add-endpoint', createdAt: 1000, closedAt: 3000 }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    expect(screen.getByText(/fix-flake/)).toBeTruthy();
    expect(screen.getByText(/add-endpoint/)).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions by title or repo' }), {
      target: { value: 'ekko' },
    });

    expect(screen.queryByText(/fix-flake/)).toBeNull();
    expect(screen.getByText(/add-endpoint/)).toBeTruthy();
  });

  it('selects matching sessions via checkboxes and bulk-deletes them after confirming once', async () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'first', createdAt: 1000, closedAt: 2000 }),
        closedSession({ id: 'b', repoId: 'r1', title: 'repo-one', name: 'second', createdAt: 1000, closedAt: 3000 }),
        closedSession({ id: 'c', repoId: 'r1', title: 'repo-one', name: 'third', createdAt: 1000, closedAt: 4000 }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select first' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select second' }));

    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Purge' }));

    await waitFor(() => expect(purge).toHaveBeenCalledTimes(2));
    expect(purge).toHaveBeenCalledWith({ sessionId: 'a' });
    expect(purge).toHaveBeenCalledWith({ sessionId: 'b' });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('selects every matching row via the header checkbox, respecting the active search', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'alpha', createdAt: 1000, closedAt: 2000 }),
        closedSession({ id: 'b', repoId: 'r1', title: 'repo-one', name: 'beta', createdAt: 1000, closedAt: 3000 }),
        closedSession({ id: 'c', repoId: 'r1', title: 'repo-one', name: 'gamma', createdAt: 1000, closedAt: 4000 }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions by title or repo' }), {
      target: { value: 'a' }, // matches alpha, beta, gamma (all contain 'a')
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions by title or repo' }), {
      target: { value: 'al' }, // narrows to alpha only
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all matching sessions' }));

    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('toggles repo group collapse when clicking group accordion header', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 'a',
          repoId: 'r1',
          title: 'repo-one',
          name: 'session-in-r1',
          createdAt: 1000,
          closedAt: 2000,
        }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const collapseButton = screen.getByRole('button', { name: 'Collapse repo-one' });
    expect(collapseButton).toBeTruthy();
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(collapseButton);
    expect(screen.getByRole('button', { name: 'Expand repo-one' })).toBeTruthy();
  });

  it('shows a live session above a closed one in the same repo group, with no purge affordance', () => {
    historyResult.mockReturnValue({
      data: [closedSession({ id: 'c1', repoId: 'r1', title: 'repo-one', name: 'closed-one', createdAt: 1000, closedAt: 2000 })],
      isPending: false,
      isError: false,
    });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
      });
    });

    renderView();

    const list = screen.getByRole('list', { name: 'Sessions' });
    const rows = within(list).getAllByRole('button', { name: /live-one|closed-one/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('live-one'),
      expect.stringContaining('closed-one'),
    ]);

    const liveRow = screen.getByText('live-one').closest('.group');
    expect(liveRow?.querySelector('button[aria-label="Purge session"]')).toBeNull();
    expect(liveRow?.querySelector('input[type="checkbox"]')).toBeNull();

    const closedRow = screen.getByText('closed-one').closest('.group');
    expect(closedRow?.querySelector('button[aria-label="Purge session"]')).toBeTruthy();
    expect(closedRow?.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it('places the agent icon ahead of the label rather than trailing it', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 'claude-s1',
          repoId: 'r1',
          title: 'repo-one',
          kind: 'agent',
          agentId: 'claude',
          createdAt: 1000,
          closedAt: 2000,
        }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const row = screen.getByRole('button', { name: /Claude/ });
    const icon = row.querySelector('svg');
    const label = within(row).getByText('Claude');
    expect(icon).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING: the label comes AFTER the icon in the DOM.
    expect(icon!.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the status dot state in a focusable, keyboard-reachable tooltip', async () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'a', repoId: 'r1', title: 'repo-one', name: 'crashed', createdAt: 1000, closedAt: 2000, reason: 'exited' }),
      ],
      isPending: false,
      isError: false,
    });

    renderView();

    const dot = screen.getByLabelText('Exited on its own');
    expect(dot.tabIndex).toBe(0);

    fireEvent.focus(dot);
    expect((await screen.findByRole('tooltip')).textContent).toContain('Exited on its own');
  });

  it('names a running session as such in the dot tooltip', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
      });
    });

    renderView();

    expect(screen.getByLabelText('Running')).toBeTruthy();
  });

  it('names an asleep session as such in the dot tooltip, and offers no purge affordance', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'sleep-1', repoId: 'r1', title: 'repo-one', name: 'sleeping-one', createdAt: 5000, asleep: true }),
        ],
      });
    });

    renderView();

    expect(screen.getByLabelText('Asleep — process stopped, transcript kept')).toBeTruthy();
    const row = screen.getByText('sleeping-one').closest('.group');
    expect(row?.querySelector('button[aria-label="Purge session"]')).toBeNull();
  });

  it('filters sessions by the liveness facet', () => {
    historyResult.mockReturnValue({
      data: [closedSession({ id: 'c1', repoId: 'r1', title: 'repo-one', name: 'closed-one', createdAt: 1000, closedAt: 2000 })],
      isPending: false,
      isError: false,
    });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
      });
    });

    renderView();

    expect(screen.getByText(/closed-one/)).toBeTruthy();
    expect(screen.getByText(/live-one/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'All states' }));
    fireEvent.click(screen.getByRole('option', { name: 'Running' }));

    expect(screen.getByText(/live-one/)).toBeTruthy();
    expect(screen.queryByText(/closed-one/)).toBeNull();
  });

  it('shows a placeholder notice for a selected live row instead of a transcript', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-one/ }));

    expect(screen.getByText(/open the terminal panel to interact with it/)).toBeTruthy();
    expect(screen.queryByTestId('transcript')).toBeNull();
  });

  it('flips a selected live row over to its transcript once the session closes while mounted', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'sess-1', repoId: 'r1', title: 'repo-one', name: 'running-one', createdAt: 5000 })],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /running-one/ }));
    expect(screen.getByText(/open the terminal panel to interact with it/)).toBeTruthy();

    historyResult.mockReturnValue({
      data: [
        closedSession({ id: 'sess-1', repoId: 'r1', title: 'repo-one', name: 'running-one', createdAt: 5000, closedAt: 6000 }),
      ],
      isPending: false,
      isError: false,
    });
    act(() => {
      useTerminalStore.setState({ sessions: [] });
    });

    expect(screen.getByTestId('transcript').textContent).toBe('sess-1');
  });
});

