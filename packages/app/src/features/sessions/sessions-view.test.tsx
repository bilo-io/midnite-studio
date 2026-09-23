import type { ClosedSession, TerminalSession } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useSessionsStore } from '../../store/sessions-store';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { useGraphStore } from '../graph/graph-store';
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

// Same reasoning as `TranscriptView` above — `LiveSessionTerminal` needs a
// real xterm and a live pty subscription of its own; both get their own
// dedicated test (`live-session-terminal.test.tsx`).
vi.mock('./live-session-terminal', () => ({
  LiveSessionTerminal: ({ session }: { session: { id: string } }) => (
    <div data-testid="live-terminal">{session.id}</div>
  ),
}));

const purge = vi.fn().mockResolvedValue(undefined);
const save = vi.fn().mockResolvedValue(undefined);
const forget = vi.fn().mockResolvedValue(undefined);
const killPty = vi.fn().mockResolvedValue(undefined);
// Default: no loop ever launched anything — individual tests override with
// `mockResolvedValueOnce` so the loop-icon fixture never bleeds into another.
const loopRunsList = vi.fn().mockResolvedValue({ runs: [] });
// `terminal.list` backs the view's own `hydrate()` call (mirroring
// `terminal-panel.tsx`'s and `fab-panel.tsx`'s) — an empty answer, since
// every test seeds `useTerminalStore`'s `sessions` directly and this is only
// here so `hydrate()` has something to resolve against instead of throwing
// on a bridge that doesn't implement it.
const listSessions = vi.fn().mockResolvedValue({ sessions: [], broker: { mode: 'broker' } });
vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    sessions: { purge },
    terminal: { save, forget, list: listSessions },
    pty: { kill: killPty },
    loopRuns: { list: loopRunsList, onChanged: () => () => {} },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // The store is a module-level singleton — reset the fields this
  // view reads so one test's live session never bleeds into the next.
  useTerminalStore.setState({
    sessions: [],
    states: {},
    activity: {},
    pendingInput: {},
    foregroundCommand: {},
    hydrated: false,
    sessionsPaneSessionId: null,
  });
  useGraphStore.setState({ rows: [] });
  useUiStore.setState({
    terminalOpen: false,
    fabPanelOpen: false,
    fabDetached: false,
    fabSessions: {},
    activeFabTab: 'guard',
    graphSessionFilter: null,
    graphShaFilter: null,
    activeView: 'sessions',
  });
  useSessionsStore.setState({ selectedClosedSessionId: null, selectedLiveSessionId: null });
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
  it('hydrates the terminal store on its own mount, rather than depending on the terminal or Loops panel ever opening first', async () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    expect(useTerminalStore.getState().hydrated).toBe(false);

    renderView();

    await waitFor(() => expect(listSessions).toHaveBeenCalled());
    await waitFor(() => expect(useTerminalStore.getState().hydrated).toBe(true));
  });

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

  it('wears the activity glow ring on a live agent row (Phase 95 Theme C)', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000, kind: 'agent', agentId: 'claude' }),
        ],
      });
    });

    renderView();

    const row = screen.getByRole('button', { name: /live-one/ });
    const glow = row.querySelector('[data-testid="session-row-icon-glow"]');
    expect(glow).not.toBeNull();
    expect(glow?.getAttribute('data-activity-status')).toBe('agent');
  });

  it('never wears the glow ring on a closed row', () => {
    historyResult.mockReturnValue({
      data: [
        closedSession({
          id: 'claude-s1',
          repoId: 'r1',
          title: 'repo-one',
          name: 'closed-agent',
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

    const row = screen.getByRole('button', { name: /closed-agent/ });
    expect(row.querySelector('[data-testid="session-row-icon-glow"]')).toBeNull();
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

  it('embeds the live terminal for a selected running row instead of a transcript', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-one/ }));

    expect(screen.getByTestId('live-terminal').textContent).toBe('live-1');
    expect(screen.queryByTestId('transcript')).toBeNull();
    // The embed holds the one-xterm-per-pty lock, so a terminal panel opened
    // afterwards yields this session's slot rather than mounting over it.
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('live-1');
  });

  it('names an asleep row as such in the detail pane rather than embedding a terminal', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'sleep-1', repoId: 'r1', title: 'repo-one', name: 'sleeping-one', createdAt: 5000, asleep: true }),
        ],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /sleeping-one/ }));

    expect(screen.getByText(/asleep — no live process to show/i)).toBeTruthy();
    expect(screen.queryByTestId('live-terminal')).toBeNull();
  });

  it('embeds the live terminal for a running FAB-surface (Loop) session, with no "open Loops" dead end', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'fab-1', repoId: 'r1', title: 'repo-one', name: 'loop-one', createdAt: 5000, surface: 'fab' }),
        ],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /loop-one/ }));

    expect(screen.getByTestId('live-terminal').textContent).toBe('fab-1');
    expect(screen.queryByText(/running in the Loops panel/)).toBeNull();
    expect(screen.queryByText(/open Loops/)).toBeNull();
  });

  it('hands off to the terminal panel instead of embedding a second live terminal while it is open', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-2', repoId: 'r1', title: 'repo-one', name: 'live-two', createdAt: 5000 })],
      });
      useUiStore.setState({ terminalOpen: true });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-two/ }));

    expect(screen.getByText(/already open in the terminal panel/)).toBeTruthy();
    expect(screen.queryByTestId('live-terminal')).toBeNull();
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBeNull();

    // Primary is "here", secondary is "there" — the same right-hand-primary
    // order `confirm-dialog.tsx` uses.
    const here = screen.getByRole('button', { name: 'Focus it here' });
    const there = screen.getByRole('button', { name: 'Focus it there' });
    expect(here.className).toContain('bg-primary');
    expect(there.className).not.toContain('bg-primary');
    expect(here.compareDocumentPosition(there) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

    fireEvent.click(there);
    expect(useTerminalStore.getState().activeId).toBe('live-2');

    act(() => {
      useUiStore.setState({ terminalOpen: false });
    });
  });

  it('pulls the live terminal into the pane on "Focus it here" and takes the claim the terminal panel yields to', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-4', repoId: 'r1', title: 'repo-one', name: 'live-four', createdAt: 5000 })],
      });
      useUiStore.setState({ terminalOpen: true });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-four/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus it here' }));

    expect(screen.getByTestId('live-terminal').textContent).toBe('live-4');
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('live-4');

    // The terminal panel's own "Focus it here" clears the claim; the pane
    // falls back to the hand-off card instead of keeping a second xterm.
    act(() => {
      useTerminalStore.getState().releaseSessionsPane('live-4');
    });
    expect(screen.queryByTestId('live-terminal')).toBeNull();
    expect(screen.getByRole('button', { name: 'Focus it here' })).toBeTruthy();

    act(() => {
      useUiStore.setState({ terminalOpen: false });
    });
  });

  it('keeps the embed when the terminal panel opens afterwards — the panel yields, not the pane', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-5', repoId: 'r1', title: 'repo-one', name: 'live-five', createdAt: 5000 })],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-five/ }));
    expect(screen.getByTestId('live-terminal').textContent).toBe('live-5');

    act(() => {
      useUiStore.setState({ terminalOpen: true });
    });
    expect(screen.getByTestId('live-terminal').textContent).toBe('live-5');
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('live-5');

    act(() => {
      useUiStore.setState({ terminalOpen: false });
    });
  });

  it('offers only the reveal button when the terminal panel is detached into its own window', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-6', repoId: 'r1', title: 'repo-one', name: 'live-six', createdAt: 5000 })],
      });
      useUiStore.setState({ terminalOpen: true, terminalDetached: true });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-six/ }));

    expect(screen.getByText(/in its own window/)).toBeTruthy();
    expect(screen.queryByTestId('live-terminal')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Focus it here' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Focus it there' })).toBeTruthy();
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBeNull();

    act(() => {
      useUiStore.setState({ terminalOpen: false, terminalDetached: false });
    });
  });

  it('shows the loop glyph only on the row a loop actually launched', async () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'loop-sess', repoId: 'r1', title: 'repo-one', name: 'loop-launched', createdAt: 5000, surface: 'fab' }),
          liveSession({ id: 'plain-sess', repoId: 'r1', title: 'repo-one', name: 'plain-shell', createdAt: 5000 }),
        ],
      });
    });
    loopRunsList.mockResolvedValueOnce({
      runs: [
        {
          id: 'run-1',
          loopId: 'guard',
          sessionId: 'loop-sess',
          startedAt: 1,
          composedPrompt: 'x',
          checkedModifierIds: [],
          status: 'running',
        },
      ],
    });

    renderView();

    const loopRow = screen.getByText('loop-launched').closest('.group');
    const plainRow = screen.getByText('plain-shell').closest('.group');

    await waitFor(() => {
      expect(loopRow?.querySelector('[aria-label="Started by the Guard loop"]')).toBeTruthy();
    });
    expect(plainRow?.querySelector('[aria-label^="Started by"]')).toBeNull();
  });

  it('gives every list item the same shared row-height class — live, asleep and closed alike', () => {
    historyResult.mockReturnValue({
      data: [closedSession({ id: 'c1', repoId: 'r1', title: 'repo-one', name: 'closed-one', createdAt: 1000, closedAt: 2000 })],
      isPending: false,
      isError: false,
    });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 }),
          liveSession({
            id: 'sleep-1',
            repoId: 'r1',
            title: 'repo-one',
            name: 'sleeping-one',
            createdAt: 5000,
            asleep: true,
          }),
          liveSession({
            id: 'agent-1',
            repoId: 'r1',
            title: 'repo-one',
            kind: 'agent',
            agentId: 'claude',
            createdAt: 5000,
          }),
        ],
      });
    });

    renderView();

    const rowHeights = new Set(
      ['live-one', 'sleeping-one', 'closed-one', 'Claude']
        .map((label) => screen.getByText(label).closest('.group'))
        .map((row) => [...(row?.classList ?? [])].find((cls) => /^h-\d+$/.test(cls))),
    );
    expect(rowHeights.size).toBe(1);
    expect([...rowHeights][0]).toBeTruthy();
  });

  it('kills a live session after confirming, through the same close path the terminal panel uses', async () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-1', repoId: 'r1', title: 'repo-one', name: 'live-one', createdAt: 5000 })],
        states: { 'live-1': 'open' },
        foregroundCommand: { 'live-1': 'npm run dev' },
      });
    });

    renderView();

    const killButton = screen.getByRole('button', { name: 'Kill session' });
    fireEvent.click(killButton);
    expect(forget).not.toHaveBeenCalled();

    // Same confirm the terminal panel's own close button shows for a live
    // session with a foreground command running (`closeSessionWithConfirm`).
    expect(screen.getByText('npm run dev is still running and will be killed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close session' }));

    await waitFor(() => expect(forget).toHaveBeenCalledWith({ sessionId: 'live-1', reason: 'closed' }));
    expect(useTerminalStore.getState().sessions.some((s) => s.id === 'live-1')).toBe(false);
  });

  it('offers no kill button on a closed row, and the kill click never reaches row selection', () => {
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

    const closedRow = screen.getByText('closed-one').closest('.group');
    expect(closedRow?.querySelector('button[aria-label="Kill session"]')).toBeNull();

    const liveRow = screen.getByText('live-one').closest('.group');
    expect(liveRow?.querySelector('button[aria-label="Kill session"]')).toBeTruthy();

    expect(useSessionsStore.getState().selectedLiveSessionId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kill session' }));
    // Nothing running in the foreground on this session, so
    // `closeSessionWithConfirm` closes immediately with no dialog — and the
    // click never bubbled up to select the row underneath the button.
    expect(useTerminalStore.getState().sessions.some((s) => s.id === 'live-1')).toBe(false);
    expect(useSessionsStore.getState().selectedLiveSessionId).toBeNull();
  });

  it('hands off to the Loops panel instead of embedding a second live terminal while it is already open', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'fab-2', repoId: 'r1', title: 'repo-one', name: 'loop-two', createdAt: 5000, surface: 'fab' }),
        ],
      });
      useUiStore.setState({ fabPanelOpen: true, fabSessions: { guard: 'fab-2' } });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /loop-two/ }));

    expect(screen.getByText(/already open in the Loops panel/)).toBeTruthy();
    expect(screen.queryByTestId('live-terminal')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal in Loops' }));
    expect(useUiStore.getState().activeFabTab).toBe('guard');

    fireEvent.click(screen.getByRole('button', { name: 'Focus it here' }));
    expect(screen.getByTestId('live-terminal').textContent).toBe('fab-2');
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('fab-2');

    act(() => {
      useUiStore.setState({ fabPanelOpen: false, fabSessions: {} });
    });
  });

  it('hands off to the Loops panel while it is detached into its own window too', () => {
    historyResult.mockReturnValue({ data: [], isPending: false, isError: false });
    act(() => {
      useTerminalStore.setState({
        sessions: [
          liveSession({ id: 'fab-3', repoId: 'r1', title: 'repo-one', name: 'loop-three', createdAt: 5000, surface: 'fab' }),
        ],
      });
      useUiStore.setState({ fabPanelOpen: false, fabDetached: true, fabSessions: { guard: 'fab-3' } });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /loop-three/ }));

    expect(screen.getByText(/open in the Loops panel, in its own window/)).toBeTruthy();
    expect(screen.queryByTestId('live-terminal')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Focus it here' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reveal in Loops' })).toBeTruthy();

    act(() => {
      useUiStore.setState({ fabDetached: false, fabSessions: {} });
    });
  });

  it('detaches the live terminal when navigating away to a different session', () => {
    historyResult.mockReturnValue({
      data: [closedSession({ id: 'closed-1', repoId: 'r1', title: 'repo-one', name: 'closed-one', createdAt: 1000, closedAt: 2000 })],
      isPending: false,
      isError: false,
    });
    act(() => {
      useTerminalStore.setState({
        sessions: [liveSession({ id: 'live-3', repoId: 'r1', title: 'repo-one', name: 'live-three', createdAt: 5000 })],
      });
    });

    renderView();

    fireEvent.click(screen.getByRole('button', { name: /live-three/ }));
    expect(screen.getByTestId('live-terminal').textContent).toBe('live-3');

    expect(useTerminalStore.getState().sessionsPaneSessionId).toBe('live-3');

    fireEvent.click(screen.getByRole('button', { name: /closed-one/ }));

    expect(screen.queryByTestId('live-terminal')).toBeNull();
    expect(screen.getByTestId('transcript').textContent).toBe('closed-1');
    // The claim goes with the embed, so the terminal panel gets its slot back.
    expect(useTerminalStore.getState().sessionsPaneSessionId).toBeNull();
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
    expect(screen.getByTestId('live-terminal').textContent).toBe('sess-1');

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

  describe('Resume action (Phase 86 Theme C)', () => {
    it('shows resume button with exact ID tooltip when conversationId is present', () => {
      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-claude',
            repoId: 'r1',
            title: 'repo-one',
            name: 'claude-session',
            kind: 'agent',
            agentId: 'claude',
            agentConversationId: '12345678-1234-1234-1234-123456789abc',
            createdAt: 1000,
            closedAt: 2000,
          }),
        ],
        isPending: false,
        isError: false,
      });

      renderView();

      const expectedTooltip =
        'Resume conversation 12345678-1234-1234-1234-123456789abc (claude --resume 12345678-1234-1234-1234-123456789abc)';
      const resumeButton = screen.getByRole('button', { name: expectedTooltip });
      expect(resumeButton).toBeTruthy();
    });

    it('shows resume button with directory fallback tooltip when conversationId is absent', () => {
      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-claude-fallback',
            repoId: 'r1',
            title: 'repo-one',
            name: 'claude-no-id',
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

      const expectedTooltip =
        'Resume most recent conversation in this directory rather than this session (claude --continue)';
      const resumeButton = screen.getByRole('button', { name: expectedTooltip });
      expect(resumeButton).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Resume conversation/ })).toBeNull();
    });

    it('does not render resume button for agents with no resume mechanism (e.g. agy)', () => {
      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-agy',
            repoId: 'r1',
            title: 'repo-one',
            name: 'agy-session',
            kind: 'agent',
            agentId: 'agy',
            createdAt: 1000,
            closedAt: 2000,
          }),
        ],
        isPending: false,
        isError: false,
      });

      renderView();

      const row = screen.getByText('agy-session').closest('.group');
      expect(row?.querySelector('button[aria-label^="Resume"]')).toBeNull();
    });

    it('does not render resume button for shell sessions', () => {
      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-shell',
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

      const row = screen.getByText('shell-session').closest('.group');
      expect(row?.querySelector('button[aria-label^="Resume"]')).toBeNull();
    });

    it('clicking resume calls startAgent with autoSend: true and queued input', () => {
      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-codex',
            repoId: 'r1',
            cwd: '/work/repo-one',
            title: 'repo-one',
            name: 'codex-session',
            kind: 'agent',
            agentId: 'codex',
            agentConversationId: 'rollout-abc',
            createdAt: 1000,
            closedAt: 2000,
          }),
        ],
        isPending: false,
        isError: false,
      });

      renderView();

      const resumeButton = screen.getByRole('button', {
        name: 'Resume conversation rollout-abc (codex resume rollout-abc)',
      });
      fireEvent.click(resumeButton);

      const store = useTerminalStore.getState();
      expect(store.sessions).toHaveLength(1);
      const newSession = store.sessions[0]!;
      expect(newSession.agentId).toBe('codex');
      expect(newSession.cwd).toBe('/work/repo-one');
      expect(store.pendingInput[newSession.id]).toBe('codex resume rollout-abc\r');
    });
  });

  describe('crosswalk: sessions ↔ commits (Phase 78 Theme D)', () => {
    it('closed agent session displays commit count matching commitsForSession and clicking navigates to Graph view', () => {
      useGraphStore.setState({
        rows: [
          {
            row: 0,
            lane: 0,
            colorIdx: 0,
            edges: [],
            laneCount: 1,
            commit: {
              sha: 'sha-c1',
              parents: [],
              authorName: 'Claude',
              authorEmail: 'claude@anthropic.com',
              authorDate: 1500,
              committerDate: 1500,
              subject: 'agent commit 1',
              refs: [],
              coAuthors: [],
              sessionTrailers: ['c-agent-1'],
            },
          },
          {
            row: 1,
            lane: 0,
            colorIdx: 0,
            edges: [],
            laneCount: 1,
            commit: {
              sha: 'sha-c2',
              parents: [],
              authorName: 'Claude',
              authorEmail: 'claude@anthropic.com',
              authorDate: 1600,
              committerDate: 1600,
              subject: 'agent commit 2',
              refs: [],
              coAuthors: [],
              sessionTrailers: ['c-agent-1'],
            },
          },
          {
            row: 2,
            lane: 0,
            colorIdx: 0,
            edges: [],
            laneCount: 1,
            commit: {
              sha: 'sha-h1',
              parents: [],
              authorName: 'Human',
              authorEmail: 'human@example.com',
              authorDate: 3000,
              committerDate: 3000,
              subject: 'human commit',
              refs: [],
              coAuthors: [],
              sessionTrailers: [],
            },
          },
        ],
      });

      historyResult.mockReturnValue({
        data: [
          closedSession({
            id: 'c-agent-1',
            repoId: 'r1',
            title: 'repo-one',
            name: 'agent-session',
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

      const countBtn = screen.getByTestId('session-commit-count');
      expect(countBtn.textContent).toBe('2 commits');

      fireEvent.click(countBtn);

      expect(useUiStore.getState().graphSessionFilter).toBe('c-agent-1');
      expect(useUiStore.getState().graphShaFilter).toEqual(['sha-c1', 'sha-c2']);
      expect(useUiStore.getState().activeView).toBe('graph');
    });

    it('live agent session shows commits made since createdAt', () => {
      useGraphStore.setState({
        rows: [
          {
            row: 0,
            lane: 0,
            colorIdx: 0,
            edges: [],
            laneCount: 1,
            commit: {
              sha: 'sha-live-1',
              parents: [],
              authorName: 'Human',
              authorEmail: 'human@example.com',
              authorDate: 1500,
              committerDate: 1500,
              subject: 'commit during live session',
              refs: [],
              coAuthors: [],
              sessionTrailers: [],
            },
          },
          {
            row: 1,
            lane: 0,
            colorIdx: 0,
            edges: [],
            laneCount: 1,
            commit: {
              sha: 'sha-live-old',
              parents: [],
              authorName: 'Human',
              authorEmail: 'human@example.com',
              authorDate: 500,
              committerDate: 500,
              subject: 'commit before live session',
              refs: [],
              coAuthors: [],
              sessionTrailers: [],
            },
          },
        ],
      });

      historyResult.mockReturnValue({ data: [], isPending: false, isError: false });

      useTerminalStore.setState({
        sessions: [
          liveSession({
            id: 'live-agent-1',
            repoId: 'r1',
            title: 'repo-one',
            kind: 'agent',
            agentId: 'claude',
            createdAt: 1000,
          }),
        ],
      });

      renderView();

      const countBtn = screen.getByTestId('session-commit-count');
      expect(countBtn.textContent).toBe('1 commit');
    });
  });
});

