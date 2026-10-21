import type { StashEntry, StatusResult } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GRAPH_THEMES } from './graph-themes';
import { StashRows } from './stash-rows';
import { UncommittedRow } from './uncommitted-row';

/** vitest/jsdom: DOM attributes only — no layout needed. */

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

describe('blank avatar placeholder', () => {
  for (const id of ['git-graph', 'git-extensions', 'sourcetree', 'gitkraken'] as const) {
    const theme = GRAPH_THEMES[id];
    if (theme.node !== 'avatar') continue;

    it(`stash row draws it at avatarSize in ${id}`, () => {
      const { container } = render(
        <StashRows
          repoId="r"
          stashes={[stash]}
          theme={theme}
          selectedSelector={null}
          onSelect={() => {}}
          {...common}
        />,
      );
      const g = container.querySelector('[data-testid="blank-avatar"]');
      expect(g).not.toBeNull();
      expect(g!.querySelector('circle')!.getAttribute('r')).toBe(String(theme.avatarSize / 2));
    });

    it(`uncommitted row draws it at avatarSize in ${id}`, () => {
      const { container } = render(
        <UncommittedRow status={status} theme={theme} onSelect={() => {}} {...common} />,
      );
      const g = container.querySelector('[data-testid="blank-avatar"]');
      expect(g).not.toBeNull();
      expect(g!.querySelector('circle')!.getAttribute('r')).toBe(String(theme.avatarSize / 2));
    });
  }

  it('dot styles keep the dashed ring, no placeholder', () => {
    const { container } = render(
      <UncommittedRow
        status={status}
        theme={GRAPH_THEMES.classic}
        onSelect={() => {}}
        {...common}
      />,
    );
    expect(container.querySelector('[data-testid="blank-avatar"]')).toBeNull();
  });
});
