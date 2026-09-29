import type { GraphRow } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CI_PAGE_SIZE } from './commit-ci';
import { useCommitCi } from './use-commit-ci';

const commitRunsFn = vi.fn();
vi.mock('../../services/bridge', () => ({
  bridge: () => ({ forge: { commitRuns: commitRunsFn } }),
  hasBridge: () => true,
}));

const shaFor = (index: number) => index.toString(16).padStart(40, '0');
const rows = Array.from({ length: 10_000 }, (_, index) => ({ commit: { sha: shaFor(index) } })) as unknown as GraphRow[];
const CLI = { reason: 'ready' as const, binPath: null, hint: '' };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  commitRunsFn.mockImplementation(async ({ shas }: { shas: string[] }) => ({
    cli: CLI,
    runs: Object.fromEntries(
      shas.map((sha) => [
        sha,
        sha === shaFor(3)
          ? [
              {
                id: '1',
                name: 'CI',
                status: 'completed',
                conclusion: 'failure',
                headBranch: 'main',
                headSha: sha,
                createdAt: '2026-09-01T10:00:00Z',
                url: 'https://github.com/o/r/actions/runs/1',
                event: 'push',
                workflowId: '1',
                workflowName: 'CI',
                startedAt: null,
                updatedAt: null,
                displayTitle: null,
                number: null,
                attempt: null,
              },
            ]
          : [],
      ]),
    ),
    error: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCommitCi', () => {
  it('asks only for the pages on screen, in batches, and aggregates the answer', async () => {
    const { result } = renderHook(() => useCommitCi('repo', rows, rows.length, { startIndex: 0, endIndex: 20 }, true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.get(shaFor(3))?.representative.conclusion).toBe('failure'));

    // Rows 0..25 (20 + overscan) are two aligned pages of 25 — not 10 000 lookups.
    expect(commitRunsFn).toHaveBeenCalledTimes(2);
    const asked = commitRunsFn.mock.calls.flatMap(([req]) => (req as { shas: string[] }).shas);
    expect(asked).toHaveLength(2 * CI_PAGE_SIZE);
    expect(asked).not.toContain(shaFor(5_000));
    expect(result.current.has(shaFor(4))).toBe(false);
  });

  it('serves a page it already has from cache', async () => {
    const range = { startIndex: 0, endIndex: 10 };
    const first = renderHook(() => useCommitCi('repo', rows, rows.length, range, true), { wrapper });
    await waitFor(() => expect(first.result.current.size).toBe(1));
    first.unmount();
    const calls = commitRunsFn.mock.calls.length;

    const second = renderHook(() => useCommitCi('repo', rows, rows.length, range, true), { wrapper });
    expect(second.result.current.get(shaFor(3))).toBeDefined();
    expect(commitRunsFn.mock.calls.length).toBe(calls);
  });

  it('asks for nothing while the column is off or the graph is not on screen', async () => {
    renderHook(() => useCommitCi('repo', rows, rows.length, { startIndex: 0, endIndex: 20 }, false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commitRunsFn).not.toHaveBeenCalled();
  });

  it('draws an empty column when the transport fails — no throw, no error surface', async () => {
    commitRunsFn.mockRejectedValue(new Error('ipc gone'));
    const { result } = renderHook(() => useCommitCi('repo', rows, rows.length, { startIndex: 0, endIndex: 5 }, true), {
      wrapper,
    });
    await waitFor(() => expect(commitRunsFn).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
