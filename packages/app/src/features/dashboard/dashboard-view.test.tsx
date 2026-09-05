import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardStore } from '../../store/dashboard-store';
import { useUiStore } from '../../store/ui-store';
import { DashboardView } from './dashboard-view';

/**
 * The board's own ladder — Phase 60 Theme C.
 *
 * Split across two levels on purpose, and this spec is the record of why: the
 * statistics pass feeds four widgets at once, so a pass that THREW is a fact
 * about the board and is answered before the grid is built, while the empty
 * and loading rungs stay per-widget because "no open pull requests" is not
 * something the board can say on a widget's behalf.
 */
const repoStats = vi.fn();

vi.mock('../../services/queries', () => ({
  useRepoStats: () => repoStats(),
  useRefreshStats: () => vi.fn(),
  useRemotes: () => ({ data: [] }),
  useForgePulls: () => ({ data: undefined, isFetching: false }),
  useForgeIssues: () => ({ data: undefined, isFetching: false }),
  useForgeRuns: () => ({ data: undefined, isFetching: false }),
}));

vi.mock('../../components/dialog-host', () => ({
  useDialogs: () => ({ confirm: vi.fn(), prompt: vi.fn(), openMenu: vi.fn() }),
}));

// The grid measures its container with a `ResizeObserver` and paints nothing at
// width 0, which jsdom would leave it at — so the tiles are stood in for.
vi.mock('react-grid-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="board-grid">{children}</div>
  ),
  useContainerWidth: () => ({ width: 800, containerRef: { current: null }, mounted: true }),
}));

beforeEach(() => {
  useUiStore.setState({ selectedRepoId: 'repo-1' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useDashboardStore.setState({ boards: {} });
});

const showing = (): string[] =>
  Object.entries({
    error: screen.queryByText("Could not read this repository's history"),
    empty: screen.queryByText('No widgets on this board'),
    content: screen.queryByTestId('board-grid'),
  })
    .filter(([, node]) => node !== null)
    .map(([name]) => name);

describe('DashboardView — the board’s three states', () => {
  it('shows the failure, with its own message, when the statistics pass throws', () => {
    repoStats.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: new Error('fatal: bad revision HEAD'),
    });
    render(<DashboardView />);
    expect(showing()).toEqual(['error']);
    expect(screen.getByText('fatal: bad revision HEAD')).toBeTruthy();
  });

  it('shows the empty state for a board every widget has been taken off', () => {
    repoStats.mockReturnValue({ data: undefined, isFetching: false, error: null });
    useDashboardStore.setState({
      boards: { 'repo-1': { window: '30d', authors: [], layout: [] } },
    });
    render(<DashboardView />);
    expect(showing()).toEqual(['empty']);
  });

  it('builds the grid — whose tiles carry the loading rung — once there is a board', () => {
    repoStats.mockReturnValue({ data: undefined, isFetching: true, error: null });
    render(<DashboardView />);
    expect(showing()).toEqual(['content']);
  });

  it('never shimmers over a failure: the error outranks the tiles’ own skeletons', () => {
    repoStats.mockReturnValue({
      data: undefined,
      isFetching: true,
      error: new Error('fatal: bad revision HEAD'),
    });
    render(<DashboardView />);
    expect(showing()).toEqual(['error']);
  });
});
