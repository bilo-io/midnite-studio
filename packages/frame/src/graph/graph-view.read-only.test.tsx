import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphRow } from '@midnite/studio-shared';

import { GraphView } from './graph-view';
import { useGraphStore } from './graph-store';
import { createTestGitUi, makeTestGitHost, renderWithGitHost, testGitData } from './test-host';

/**
 * The graph under a READ-ONLY composer (Phase 113 Theme O) — the frame's `GitHost` with none of
 * Studio's optional members, which is what Midnite Coder gives it. Studio's own composition keeps its
 * coverage in `packages/app/src/features/graph/*`; this file proves the view needs nothing from Studio.
 */

const sha = (n: number) => n.toString(16).padStart(40, '0');
const row = (index: number, subject: string): GraphRow => ({
  row: index,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: index === 0 ? [{ fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 }] : [],
  commit: {
    sha: sha(index + 1),
    parents: index === 0 ? [sha(2)] : [],
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    authorDate: 1_700_000_000 - index,
    committerDate: 1_700_000_000 - index,
    subject,
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
});

type Batch = (event: { requestId: string; rows: GraphRow[] }) => void;
type Done = (event: { requestId: string; total: number; truncated: boolean }) => void;
const listeners: { batch?: Batch; done?: Done } = {};
const start = vi.fn(async ({ requestId }: { requestId: string }) => {
  queueMicrotask(() => {
    listeners.batch?.({ requestId, rows: [row(0, 'Second commit'), row(1, 'First commit')] });
    listeners.done?.({ requestId, total: 2, truncated: false });
  });
});

beforeEach(() => {
  start.mockClear();
  Object.defineProperty(window, 'midniteStudio', {
    configurable: true,
    value: {
      log: {
        start,
        cancel: vi.fn(async () => undefined),
        onBatch: (fn: Batch) => ((listeners.batch = fn), () => undefined),
        onDone: (fn: Done) => ((listeners.done = fn), () => undefined),
      },
    },
  });
  testGitData.refs = [];
  testGitData.status = undefined;
});

afterEach(() => {
  cleanup();
  useGraphStore.getState().reset();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('GraphView under a read-only host', () => {
  it('streams the history and opens a commit in the composer’s panel', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1' });
    renderWithGitHost(<GraphView />, makeTestGitHost(ui));

    expect(await screen.findByText('Second commit')).toBeTruthy();
    expect(screen.getByText('First commit')).toBeTruthy();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ repoId: 'repo-1' }));

    const commitRow = screen.getAllByRole('row').find((candidate) => within(candidate).queryByText('Second commit'));
    fireEvent.click(commitRow!);
    await waitFor(() => expect(screen.getByTestId('test-commit-panel').textContent).toBe(sha(1)));
    expect(ui.getState().graphSelection).toEqual({ kind: 'commit', sha: sha(1) });
  });

  it('opens no menu and makes no write on a right-click — there are no actions to offer', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1' });
    renderWithGitHost(<GraphView />, makeTestGitHost(ui));
    const subject = await screen.findByText('Second commit');
    fireEvent.contextMenu(subject);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with no repository selected', () => {
    renderWithGitHost(<GraphView />, makeTestGitHost(createTestGitUi()));
    expect(screen.getByText('No repository selected')).toBeTruthy();
  });
});
