import { aggregateCommitRuns, ForgeRunSchema, type GraphRow, type Ref } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommitGraphRow, type GraphRowProps } from './graph-row';
import { graphThemeFor } from './graph-themes';

const theme = graphThemeFor('default', 'comfortable');
const SHA = 'd'.repeat(40);

const row: GraphRow = {
  row: 0,
  commit: {
    sha: SHA,
    subject: 'feat: ci',
    authorEmail: 'a@example.com',
    authorName: 'A',
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

const ref: Ref = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: SHA,
  isHead: true,
  worktreePath: null,
  upstream: null,
} as Ref;

const ci = aggregateCommitRuns([
  ForgeRunSchema.parse({
    id: '1',
    name: 'CI',
    status: 'in_progress',
    conclusion: null,
    headSha: SHA,
    createdAt: '2026-09-01T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
  }),
])!;

function renderRow(props: Partial<GraphRowProps>) {
  return render(
    <CommitGraphRow
      row={row}
      refs={[ref]}
      selected={false}
      gutterWidth={32}
      laneWidth={16}
      theme={theme}
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

describe('CommitGraphRow — CI column', () => {
  afterEach(cleanup);

  it('sits between the branch/tag column and the lane gutter', () => {
    const { container } = renderRow({ ci });
    const cell = container.querySelector('[data-graph-ci-cell]')!;
    // The lane gutter — GraphSvg is the svg sized to `gutterWidth`.
    const svg = container.querySelector('svg[width="32"]')!;
    const branch = screen.getByText('main');
    // DOCUMENT_POSITION_FOLLOWING = 4
    expect(branch.compareDocumentPosition(cell) & 4).toBeTruthy();
    expect(cell.compareDocumentPosition(svg) & 4).toBeTruthy();
  });

  it('carries the ref connector through the column: rule, CI segment, then the SVG segment', () => {
    const { container } = renderRow({ ci });
    const segments = container.querySelectorAll('[data-graph-connector]');
    // The chip-side rule and the CI cell's own segment; GraphSvg draws the third as a <line>.
    expect(segments).toHaveLength(2);
    const [rule, through] = segments as unknown as HTMLElement[];
    expect(through!.style.backgroundColor).toBe(rule!.style.backgroundColor);
  });

  it('opens the run on click without selecting the row', () => {
    const onSelect = vi.fn();
    const onOpenCi = vi.fn();
    renderRow({ ci, onSelect, onOpenCi });
    fireEvent.click(screen.getByRole('button', { name: 'CI: running — open run' }));
    expect(onOpenCi).toHaveBeenCalledWith(SHA);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('draws no mark for a commit with no CI', () => {
    renderRow({ ci: undefined });
    expect(screen.queryByRole('button', { name: /^CI:/ })).toBeNull();
  });
});
