import type { StashEntry, StatusResult } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GRAPH_THEMES, besideMarkSize } from './graph-themes';
import { StashRows } from './stash-rows';
import { UncommittedRow } from './uncommitted-row';

/**
 * vitest/jsdom: the pseudo-rows above the list reserve the commit rows'
 * `beside` agent slot, so their dashed rail lines up with the solid rails
 * under them. Inline widths only — no layout needed.
 */

afterEach(cleanup);

const stash = {
  selector: 'stash@{0}',
  sha: 'a'.repeat(40),
  parents: ['b'.repeat(40)],
  message: 'wip',
  authoredAt: 1,
  author: { name: 'Ada', email: 'ada@example.com' },
} as unknown as StashEntry;

const status = {
  branch: { unborn: false },
  entries: [{ path: 'a.ts', conflicted: false }],
} as unknown as StatusResult;

const common = { gutterWidth: 60, laneWidth: 20, colorIdx: 0, lane: 0 };
const theme = GRAPH_THEMES.gitkraken;

describe('pseudo-row beside slot', () => {
  it('the uncommitted row reserves the agent slot in beside mode', () => {
    const { getByTestId } = render(
      <UncommittedRow
        status={status}
        theme={theme}
        markMode="beside"
        onSelect={() => {}}
        {...common}
      />,
    );
    expect(getByTestId('uncommitted-provenance-slot').style.width).toBe(
      `${besideMarkSize(theme)}px`,
    );
  });

  it('the stash row reserves the agent slot in beside mode', () => {
    const { getByTestId } = render(
      <StashRows
        repoId="r"
        stashes={[stash]}
        theme={theme}
        selectedSelector={null}
        markMode="beside"
        onSelect={() => {}}
        {...common}
      />,
    );
    expect(getByTestId('stash-provenance-slot').style.width).toBe(`${besideMarkSize(theme)}px`);
  });

  it('neither reserves it in badge mode, where commit rows have no slot either', () => {
    const { queryByTestId } = render(
      <>
        <UncommittedRow
          status={status}
          theme={theme}
          markMode="badge"
          onSelect={() => {}}
          {...common}
        />
        <StashRows
          repoId="r"
          stashes={[stash]}
          theme={theme}
          selectedSelector={null}
          markMode="badge"
          onSelect={() => {}}
          {...common}
        />
      </>,
    );
    expect(queryByTestId('uncommitted-provenance-slot')).toBeNull();
    expect(queryByTestId('stash-provenance-slot')).toBeNull();
  });

  it('both pseudo-rows show a pointer cursor', () => {
    const { getByTestId, container } = render(
      <>
        <UncommittedRow
          status={status}
          theme={theme}
          markMode="badge"
          onSelect={() => {}}
          {...common}
        />
        <StashRows
          repoId="r"
          stashes={[stash]}
          theme={theme}
          selectedSelector={null}
          markMode="badge"
          onSelect={() => {}}
          {...common}
        />
      </>,
    );
    expect(getByTestId('uncommitted-row').className).toContain('cursor-pointer');
    expect(container.querySelector('.cursor-pointer.border-dashed:not([data-testid])')).not.toBeNull();
  });
});
