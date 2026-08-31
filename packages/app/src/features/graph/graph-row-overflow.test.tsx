import type { GraphRow, Ref } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommitGraphRow } from './graph-row';
import { graphThemeFor } from './graph-themes';

const theme = graphThemeFor('default', 'comfortable');

const commit = (sha: string, subject: string) => ({
  sha,
  subject,
  authorEmail: 'author@example.com',
  authorName: 'Author',
  authorDate: 1700000000,
  committerDate: 1700000000,
  parents: [],
  refs: [],
});

const row: GraphRow = {
  row: 0,
  commit: commit('abc1234', 'feat: initial commit'),
  lane: 0,
  colorIdx: 1,
  edges: [],
  laneCount: 1,
};

const makeRef = (name: string, worktreePath: string | null = null, isHead = false): Ref => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'abc1234',
  isHead,
  worktreePath,
  upstream: null,
});

describe('CommitGraphRow with RefOverflowButton', () => {
  afterEach(cleanup);

  it('renders overflow counter button when more than 2 refs are on the commit', () => {
    const refs = [
      makeRef('main', null, true),
      makeRef('feature/one', '/wt/one'),
      makeRef('feature/two', '/wt/two'),
      makeRef('feature/three', '/wt/three'),
    ];

    render(
      <CommitGraphRow
        row={row}
        refs={refs}
        selected={false}
        gutterWidth={80}
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
        isAgentActive={(r) => r.name === 'feature/two'}
      />,
    );

    // Shown chips: main and feature/one
    expect(screen.getByText('main')).toBeDefined();
    expect(screen.getByText('feature/one')).toBeDefined();
    // Overflow button: +2
    const overflowBtn = screen.getByRole('button', { name: '+2' });
    expect(overflowBtn).toBeDefined();

    // Clicking the overflow button opens the dropdown
    fireEvent.click(overflowBtn);

    const dialog = screen.getByRole('dialog', { name: 'Overflow branches' });
    expect(dialog).toBeDefined();
    expect(screen.getByText('feature/two')).toBeDefined();
    expect(screen.getByText('feature/three')).toBeDefined();
  });
});
