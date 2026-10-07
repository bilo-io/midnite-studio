import type { GraphRow, Ref } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ColumnsMenu } from './columns-menu';
import { CommitGraphRow, type GraphRowProps } from './graph-row';
import { GraphHeader, useGraphColumns } from './graph-header';
import { GRAPH_THEMES } from './graph-themes';
import { useUiStore } from '../../store/ui-store';

const SHA = 'e'.repeat(40);

const testRow: GraphRow = {
  row: 0,
  commit: {
    sha: SHA,
    subject: 'feat: add diff chart column',
    authorEmail: 'author@example.com',
    authorName: 'Author',
    authorDate: 1700000000,
    committerDate: 1700000000,
    parents: [],
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
  lane: 0,
  colorIdx: 1,
  edges: [],
  laneCount: 1,
} as unknown as GraphRow;

const testRef: Ref = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: SHA,
  isHead: true,
  worktreePath: null,
  upstream: null,
} as Ref;

function renderRow(props: Partial<GraphRowProps> = {}) {
  return render(
    <CommitGraphRow
      row={testRow}
      refs={[testRef]}
      selected={false}
      gutterWidth={32}
      laneWidth={16}
      theme={GRAPH_THEMES.classic}
      clipId="clip"
      dimmed={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      onRefContextMenu={vi.fn()}
      onRefActivate={vi.fn()}
      syncFor={() => []}
      onSync={vi.fn()}
      syncing={{}}
      currentBranch="main"
      {...props}
    />,
  );
}

function HeaderHarness() {
  const columns = useGraphColumns({ min: 32, max: 96 });
  return (
    <GraphHeader
      refs={[]}
      authors={[]}
      gutterWidth={48}
      columns={columns}
      theme={GRAPH_THEMES.classic}
    />
  );
}

describe('Diff Chart column integration', () => {
  afterEach(cleanup);

  it('renders Diff Chart column header in GraphHeader', () => {
    render(<HeaderHarness />);

    const headers = screen.getAllByRole('columnheader');
    const labels = headers.map((h) => h.textContent?.trim());

    expect(labels).toContain('Diff');
    expect(labels).toContain('Diff Chart');

    const diffIdx = labels.indexOf('Diff');
    const chartIdx = labels.indexOf('Diff Chart');
    expect(chartIdx).toBe(diffIdx + 1);
  });

  it('renders diff chart cell in CommitGraphRow when stats are provided', () => {
    const { container } = renderRow({
      diffStat: { added: 30, deleted: 15, files: 2 },
      maxDiffLines: 60,
    });

    const diffChartCell = container.querySelector('[data-testid="diff-chart-cell"]');
    expect(diffChartCell).not.toBeNull();

    const addBar = container.querySelector('[data-testid="diff-chart-add"]');
    const delBar = container.querySelector('[data-testid="diff-chart-del"]');
    expect(addBar).not.toBeNull();
    expect(delBar).not.toBeNull();

    // 30 / 60 * 46 = 23
    expect(Number(addBar?.getAttribute('width'))).toBeCloseTo(23, 1);
    // 15 / 60 * 46 = 11.5
    expect(Number(delBar?.getAttribute('width'))).toBeCloseTo(11.5, 1);
  });

  it('renders merge commit em-dash in diff chart cell', () => {
    const { container } = renderRow({
      diffStat: null,
      maxDiffLines: 100,
    });

    const diffChartCell = container.querySelector('[data-testid="diff-chart-cell"]');
    expect(diffChartCell?.textContent?.trim()).toBe('—');
  });

  it('toggles Diff Chart visibility through ColumnsMenu', () => {
    render(<ColumnsMenu />);

    const button = screen.getByRole('button', { name: 'Configure columns' });
    fireEvent.click(button);

    const diffChartItem = screen.getByRole('menuitemcheckbox', { name: /Diff Chart/i });
    expect(diffChartItem).toBeDefined();
    expect(diffChartItem.getAttribute('aria-checked')).toBe('false');

    // Click to toggle on
    fireEvent.click(diffChartItem);
    expect(useUiStore.getState().graphColumnVisibility.diffChart).toBe(true);

    // Click to toggle off
    fireEvent.click(diffChartItem);
    expect(useUiStore.getState().graphColumnVisibility.diffChart).toBe(false);
  });
});
