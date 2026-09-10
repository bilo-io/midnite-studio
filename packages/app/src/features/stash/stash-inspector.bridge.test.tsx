import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { StashInspector } from './stash-inspector';

/**
 * Migrated from `e2e/stash-inspector.spec.ts` (Phase 82 Theme C, wave 5) —
 * both of the file's original tests: the three labelled sub-sections
 * (tracked/index/untracked), each with its own diff on a file click, and the
 * stale-selector "Stash not found" state. Both moved here cleanly; nothing
 * in this file needed real browser behaviour, so `e2e/stash-inspector.spec.ts`
 * is deleted outright.
 *
 * The diff pane is the same virtualised `DiffView` `diff-view.bridge.test.tsx`
 * already proved works under jsdom via `vitest-setup.ts`'s
 * `FiringResizeObserver` — no extra wiring needed here either.
 *
 * Wrapped in `<ToastHost>` (not part of `renderView`'s own provider stack):
 * the Apply/Pop/Branch/Drop actions (`use-stash-actions.ts`) call
 * `useToasts()` unconditionally, and `StashInspector` throws "useToasts must
 * be used inside <ToastHost>" on mount otherwise — the same hook
 * `sync-controls.bridge.test.tsx` had to wrap for.
 */

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const diffFor = (path: string, addedLine: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      heading: '@@ -1 +1 @@',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [{ kind: 'add', oldNo: null, newNo: 1, text: addedLine, ranges: [], noNewline: false }],
    },
  ],
  insertions: 1,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

afterEach(cleanup);

describe('StashInspector, assembled through the real bridge', () => {
  it('shows tracked, index and untracked files as three sections, each with its own diff', async () => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        {
          selector: 'stash@{0}',
          sha: SHA_B,
          parents: [SHA_A, SHA_A, SHA_A],
          message: 'WIP on main: try a layout change',
          authoredAt: Math.floor(Date.now() / 1000) - 3600,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
      ],
      stashDetails: {
        'stash@{0}': {
          tracked: [{ path: 'src/a.ts', oldPath: null, insertions: 1, deletions: 0 }],
          index: [{ path: 'src/b.ts', oldPath: null, insertions: 2, deletions: 0 }],
          untracked: [{ path: 'new.txt', oldPath: null, insertions: 3, deletions: 0 }],
        },
      },
      diffs: {
        'stash:stash@{0}:tracked:src/a.ts:3': diffFor('src/a.ts', 'diffed tracked line'),
        'stash:stash@{0}:index:src/b.ts:3': diffFor('src/b.ts', 'diffed index line'),
        'stash:stash@{0}:untracked:new.txt:3': diffFor('new.txt', 'diffed untracked line'),
      },
    };
    renderView(
      <ToastHost>
        <StashInspector repoId="repo-1" selector="stash@{0}" />
      </ToastHost>,
      { fixtures: data },
    );

    expect(await screen.findByRole('heading', { name: 'Tracked changes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Staged at stash time' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Untracked files' })).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('stash-files-tracked')).getByRole('button', { name: 'src/a.ts' }),
    );
    expect(await screen.findByText('diffed tracked line')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('stash-files-index')).getByRole('button', { name: 'src/b.ts' }),
    );
    expect(await screen.findByText('diffed index line')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('stash-files-untracked')).getByRole('button', { name: 'new.txt' }),
    );
    expect(await screen.findByText('diffed untracked line')).toBeTruthy();
  });

  it('reports a stale selector as not found rather than an empty panel', async () => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        {
          selector: 'stash@{0}',
          sha: SHA_A,
          parents: [SHA_B],
          message: 'WIP on main: about to be dropped',
          authoredAt: Math.floor(Date.now() / 1000) - 3600,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
      ],
      // No `stashDetails` entry for this selector — the mock's `null` answer,
      // exactly as the real handler gives for a selector no longer in the repo.
    };
    renderView(
      <ToastHost>
        <StashInspector repoId="repo-1" selector="stash@{0}" />
      </ToastHost>,
      { fixtures: data },
    );

    expect(await screen.findByText('Stash not found')).toBeTruthy();
  });
});
