import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TestsView } from './tests-view';

/**
 * The ladder Phase 60 Theme C put over test discovery: error → empty →
 * skeleton → content, and exactly one of them on screen at a time.
 *
 * The discovery hook is mocked rather than driven through a seeded
 * `QueryClient`, because the states this asserts are the hook's OWN result
 * shape (`isError`/`isPending`), and a cache seeded to produce them would be a
 * re-implementation of react-query rather than a test of this view.
 */
const discovery = vi.fn();
const refresh = vi.fn();

vi.mock('../../services/queries', () => ({
  useTestDiscovery: () => discovery(),
  useRefreshTestDiscovery: () => refresh,
}));

vi.mock('../../services/use-status', () => ({
  useActiveWorktree: () => ({ repoId: 'repo-1' }),
}));

vi.mock('./suite-list', () => ({
  SuiteList: () => <div data-testid="suite-list" />,
}));

vi.mock('./suite-detail', () => ({
  SuiteDetail: () => <div data-testid="suite-detail" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PACKAGES = [
  { name: 'app', suites: [{ id: 'app:unit', name: 'unit' }] },
];

/** Every state's own on-screen mark, so "exactly one" can be asserted as a count. */
const marks = () => ({
  error: screen.queryByText('Could not discover test suites'),
  empty: screen.queryByText('No test suites discovered'),
  skeleton: screen.queryByText('Scanning for test suites…'),
  content: screen.queryByTestId('suite-list'),
});

const showing = (): string[] =>
  Object.entries(marks())
    .filter(([, node]) => node !== null)
    .map(([name]) => name);

describe('TestsView — the three states', () => {
  it('shows the failure, with its own message, when discovery throws', () => {
    discovery.mockReturnValue({
      isError: true,
      isPending: false,
      error: new Error('spawn moon ENOENT'),
      data: undefined,
    });
    render(<TestsView />);
    expect(showing()).toEqual(['error']);
    expect(screen.getByText('spawn moon ENOENT')).toBeTruthy();
  });

  it('shows the skeleton — not the empty state — while the first pass is out', () => {
    discovery.mockReturnValue({ isError: false, isPending: true, error: null, data: undefined });
    render(<TestsView />);
    expect(showing()).toEqual(['skeleton']);
  });

  it('shows the empty state once a pass has resolved to nothing', () => {
    discovery.mockReturnValue({
      isError: false,
      isPending: false,
      error: null,
      data: { repoId: 'repo-1', packages: [] },
    });
    render(<TestsView />);
    expect(showing()).toEqual(['empty']);
  });

  it('shows the suite list once there is one', () => {
    discovery.mockReturnValue({
      isError: false,
      isPending: false,
      error: null,
      data: { repoId: 'repo-1', packages: PACKAGES },
    });
    render(<TestsView />);
    expect(showing()).toEqual(['content']);
  });
});
