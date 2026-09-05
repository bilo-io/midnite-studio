import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReflogList } from './reflog-list';

/**
 * The History view's reflog tab — Phase 60 Theme C.
 *
 * The tab is where the ladder lives rather than `history-view.tsx`, because
 * the other tab reads a synchronous in-process store and has no loading or
 * error rung to run. These cases are what stops a `git reflog` that threw from
 * rendering as "No reflog entries for this ref." — a claim about the
 * repository made from a call that never came back.
 */
const reflog = vi.fn();

vi.mock('../../services/queries', () => ({
  useReflog: () => reflog(),
  useRefs: () => ({ data: [] }),
}));

vi.mock('../../services/use-status', () => ({
  useActiveWorktree: () => ({ repoId: 'repo-1' }),
  useGitOp: () => ({ mutate: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ENTRY = {
  fullSelector: 'HEAD@{0}',
  sha: 'abcdef1234567890',
  action: 'commit' as const,
  subject: 'commit: land the ladder',
  // Unix seconds — `ReflogRow` multiplies by 1000, which an ISO string breaks.
  at: Math.floor(Date.now() / 1000),
  author: 'Someone',
};

const showing = (): string[] =>
  Object.entries({
    error: screen.queryByText('Could not read the reflog'),
    empty: screen.queryByText('No reflog entries for this ref.'),
    skeleton: screen.queryByText('Reading the reflog…'),
    content: screen.queryByLabelText('Reflog'),
  })
    .filter(([, node]) => node !== null)
    .map(([name]) => name);

describe('ReflogList — the three states', () => {
  it('shows the failure, with its own message', () => {
    reflog.mockReturnValue({
      isError: true,
      isPending: false,
      error: new Error("fatal: log for 'HEAD' only has 0 entries"),
      data: undefined,
    });
    render(<ReflogList />);
    expect(showing()).toEqual(['error']);
    expect(screen.getByText("fatal: log for 'HEAD' only has 0 entries")).toBeTruthy();
  });

  it('shows the skeleton — not the empty state — while the first read is out', () => {
    reflog.mockReturnValue({ isError: false, isPending: true, error: null, data: undefined });
    render(<ReflogList />);
    expect(showing()).toEqual(['skeleton']);
  });

  it('shows the empty state once a read has resolved to nothing', () => {
    reflog.mockReturnValue({ isError: false, isPending: false, error: null, data: [] });
    render(<ReflogList />);
    expect(showing()).toEqual(['empty']);
  });

  it('shows the entries once there are some', () => {
    reflog.mockReturnValue({ isError: false, isPending: false, error: null, data: [ENTRY] });
    render(<ReflogList />);
    expect(showing()).toEqual(['content']);
  });
});
