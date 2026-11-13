// vitest/jsdom: each GraphFeatures flag is DOM presence/absence or a class, no real layout needed.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_GRAPH_FEATURES, resolveGraphFeatures, type GraphFeatures, type GraphRow } from '@midnite/studio-shared';

import { DEFAULT_GRAPH_COLUMN_VISIBILITY } from './column-visibility';
import { useGraphStore } from './graph-store';
import { GraphView } from './graph-view';
import { createTestGitUi, makeTestGitHost, renderWithGitHost, testGitData } from './test-host';

const sha = (n: number) => n.toString(16).padStart(40, '0');
// A commit from seconds ago: the row is in the 'fresh' recency tier, which is what carries the effects.
const now = () => Math.floor(Date.now() / 1000);
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
    authorDate: now() - index,
    committerDate: now() - index,
    subject,
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
});

type Batch = (event: { requestId: string; rows: GraphRow[] }) => void;
type Done = (event: { requestId: string; total: number; truncated: boolean }) => void;
const listeners: { batch?: Batch; done?: Done } = {};
const commitStats = vi.fn(async () => ({ stats: {} }));
const start = vi.fn(async ({ requestId }: { requestId: string }) => {
  queueMicrotask(() => {
    listeners.batch?.({ requestId, rows: [row(0, 'Second commit'), row(1, 'First commit')] });
    listeners.done?.({ requestId, total: 2, truncated: false });
  });
});

beforeEach(() => {
  start.mockClear();
  commitStats.mockClear();
  Object.defineProperty(window, 'midniteStudio', {
    configurable: true,
    value: {
      log: {
        start,
        cancel: vi.fn(async () => undefined),
        onBatch: (fn: Batch) => ((listeners.batch = fn), () => undefined),
        onDone: (fn: Done) => ((listeners.done = fn), () => undefined),
      },
      status: { commitStats },
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

async function mount(features?: Partial<GraphFeatures>, ui = createTestGitUi({ selectedRepoId: 'repo-1' })) {
  const view = renderWithGitHost(<GraphView />, makeTestGitHost(ui, features ? { graphFeatures: features } : {}));
  await screen.findByText('Second commit');
  const rowOf = (subject: string) =>
    screen.getAllByRole('row').find((candidate) => within(candidate).queryByText(subject))!;
  return { ...view, ui, rowOf };
}

const effectSelector = '.commit-row-shimmer, .commit-row-glow, .commit-text-pulse, .graph-rail-glow, .graph-badge-glow';

describe('resolveGraphFeatures', () => {
  it('defaults every flag to true (Studio) and lets a partial profile turn some off', () => {
    expect(Object.values(DEFAULT_GRAPH_FEATURES).every(Boolean)).toBe(true);
    expect(resolveGraphFeatures()).toEqual(DEFAULT_GRAPH_FEATURES);
    expect(resolveGraphFeatures({ effects: false })).toEqual({ ...DEFAULT_GRAPH_FEATURES, effects: false });
  });
});

describe('GraphView with the default profile (Studio)', () => {
  it('keeps the effects, the column picker and the inline panel', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1' });
    const { container, rowOf } = await mount(undefined, ui);
    expect(container.querySelector(effectSelector)).not.toBeNull();
    expect(screen.getByLabelText('Configure columns')).toBeTruthy();
    fireEvent.click(rowOf('Second commit'));
    await waitFor(() => expect(document.querySelector('[aria-label^="Commit"] [data-testid="test-commit-panel"]')).not.toBeNull());
    expect(document.querySelector('aside [data-testid="test-commit-panel"]')).toBeNull();
  });
});

describe('effects: false', () => {
  it('applies no shimmer, pulse or glow class to a fresh commit', async () => {
    const { container, rowOf } = await mount({ effects: false });
    expect(container.querySelector(effectSelector)).toBeNull();
    fireEvent.click(rowOf('Second commit'));
    expect(container.querySelector(effectSelector)).toBeNull();
    expect(container.querySelector('[data-graph-glow]')).toBeNull();
  });
});

describe('diffChart / diffColumns', () => {
  const shown = DEFAULT_GRAPH_COLUMN_VISIBILITY;
  const withBoth = { graphColumnVisibility: { ...shown, diff: true, diffChart: true } };

  it('fetches numstat and shows both columns when the profile allows them', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1', ...withBoth });
    const { container } = await mount(undefined, ui);
    expect(container.querySelector('[data-graph-hide]')?.getAttribute('data-graph-hide')).not.toMatch(/diff/);
    await waitFor(() => expect(commitStats).toHaveBeenCalled());
  });

  it('diffColumns: false hides the Diff column and, with the chart also off, fetches nothing', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1', ...withBoth });
    const { container } = await mount({ diffColumns: false, diffChart: false }, ui);
    const hidden = container.querySelector('[data-graph-hide]')!.getAttribute('data-graph-hide')!.split(' ');
    expect(hidden).toContain('diff');
    expect(hidden).toContain('diffChart');
    await new Promise((resolve) => setTimeout(resolve, 20)); // allow-timeout: prove a fetch never starts
    expect(commitStats).not.toHaveBeenCalled();
  });

  it('diffChart: false hides only the chart; the Diff column still shows', async () => {
    const ui = createTestGitUi({ selectedRepoId: 'repo-1', ...withBoth });
    const { container } = await mount({ diffChart: false }, ui);
    const hidden = container.querySelector('[data-graph-hide]')!.getAttribute('data-graph-hide')!.split(' ');
    expect(hidden).toContain('diffChart');
    expect(hidden).not.toContain('diff');
  });
});

describe('columnPicker: false', () => {
  it('removes the columns dropdown and pins the columns to the defaults', async () => {
    const ui = createTestGitUi({
      selectedRepoId: 'repo-1',
      graphColumnVisibility: { ...DEFAULT_GRAPH_COLUMN_VISIBILITY, sha: false },
    });
    const { container } = await mount({ columnPicker: false }, ui);
    expect(screen.queryByLabelText('Configure columns')).toBeNull();
    expect(container.querySelector('[data-graph-hide]')?.getAttribute('data-graph-hide')).not.toContain('sha');
  });
});

describe('inlineExpansion: false', () => {
  it('selects the commit and opens the side inspector, never a panel inside the row', async () => {
    const { ui, rowOf } = await mount({ inlineExpansion: false });
    fireEvent.click(rowOf('Second commit'));
    await waitFor(() => expect(document.querySelector('aside [data-testid="test-commit-panel"]')).not.toBeNull());
    expect(ui.getState().graphSelection).toEqual({ kind: 'commit', sha: sha(1) });
    expect(document.querySelector('[aria-label^="Commit"] [data-testid="test-commit-panel"]')).toBeNull();
  });
});
