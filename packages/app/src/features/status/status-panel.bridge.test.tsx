import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { StatusPanel } from './status-panel';

/**
 * Migrated from `e2e/changes-panel.spec.ts` (Phase 82 Theme C, wave 2) — the
 * panel-wide and per-row totals reading the right side of a two-sided file,
 * the staging/stash/discard actions reaching the bridge with the right
 * paths, the "view all" accordion and the accordion ⇄ single-file pane
 * switch, the commit button's visibility rule, and the two sections folding
 * independently. 14 of the original 17 tests moved here; the tree-grouping
 * and totals-FORMATTING assertions this spec also carried already have
 * partial unit coverage in `build-change-tree.test.ts` and
 * `change-tree.test.tsx` (the phase doc's own instruction), so this file
 * does not restate them — `change-tree.test.tsx` gained two new tests for
 * `ChangeTree`'s own collapse interaction and its list-mode full-path
 * rendering instead of a third, redundant place to assert the same trie.
 *
 * **3 of the original 17 stay in Playwright.** "The tree ⇄ list choice
 * survives a reload" needs real `zustand/persist` rehydration, the same
 * reasoning `commit-detail.bridge.test.tsx`'s header comment gives for its
 * own reload stragglers — and its non-reload half (switching to tree view
 * and seeing `src` grouped) is already redundant with `change-tree.test.tsx`'s
 * new collapse test. "The toolbar icon buttons stay visible … when the
 * totals text is very wide" and "the commit textarea grows and shrinks back"
 * both read a real `getBoundingClientRect`/`toBeInViewport`, permanently zero
 * under jsdom's own layout engine.
 */

const entry = (
  path: string,
  over: { staged?: string; unstaged?: string; origPath?: string | null } = {},
) => ({
  path,
  origPath: over.origPath ?? null,
  staged: over.staged ?? 'unmodified',
  unstaged: over.unstaged ?? 'modified',
  conflicted: false,
  similarity: null,
});

/** A trivial one-hunk diff, keyed by path so each test file gets its own. */
const diffFor = (path: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      heading: '@@ -1,2 +1,2 @@',
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'const a = 1;', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 1, text: 'const a = 2;', ranges: [], noNewline: false },
      ],
    },
  ],
  insertions: 1,
  deletions: 1,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

/**
 * One file staged and re-edited, two more in one folder, and one at the root.
 *
 * `src/a.ts` is the load-bearing row: it is in BOTH lists, with 5 lines staged
 * and 40 unstaged, so every total below can only be right by reading the two
 * sides separately.
 */
const base: MockFixtures = {
  ...fixtures,
  statusEntries: [
    entry('src/a.ts', { staged: 'modified', unstaged: 'modified' }),
    entry('src/nested/b.ts'),
    entry('README.md', { unstaged: 'untracked' }),
  ],
  statusCounts: {
    'staged:src/a.ts': { insertions: 5, deletions: 1 },
    'unstaged:src/a.ts': { insertions: 40, deletions: 4 },
    'unstaged:src/nested/b.ts': { insertions: 2, deletions: 0 },
    'unstaged:README.md': { insertions: 7, deletions: 0 },
  },
  diffs: {
    'wt:src/a.ts': diffFor('src/a.ts'),
    'wt:src/nested/b.ts': diffFor('src/nested/b.ts'),
    'wt:README.md': diffFor('README.md'),
  },
};

const UI_STATE = { selectedRepoId: 'repo-1', selectedWorktreePath: '/tmp/midnite-studio' };

// `useStage`/`useUnstage`/`useDiscard`/`useCommit` reach `useToasts()` for a
// wired op's undo toast (`use-status.ts`'s `useGitOp`) — not something
// `test-support/render.tsx`'s shared wrapper provides, since most callers of
// `renderView` never mount an op-issuing view.
const open = (fx: MockFixtures = base) =>
  renderView(
    <ToastHost>
      <StatusPanel />
    </ToastHost>,
    { fixtures: fx, uiState: UI_STATE },
  );

/** The panel-wide roll-up is the first totals element — it sits above both sections. */
const panelTotals = () => screen.getAllByTestId('change-totals')[0]!;
const row = (path: string) => screen.getAllByRole('button', { name: path });

const opsOf = (op: string) =>
  (window as unknown as { __mstudioOps: { op: string; args: Record<string, unknown> }[] })
    .__mstudioOps.filter((c) => c.op === op);

afterEach(cleanup);

describe('StatusPanel, assembled through the real bridge', () => {
  it('the panel totals the whole checkout, counting a two-sided file once', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    // Three paths, not four rows: `src/a.ts` is listed twice because staging
    // acts on one side at a time, but it is one changed file.
    expect(panelTotals().textContent).toContain('3 files');
    // Lines DO add up across the sides — a staged hunk and an unstaged hunk in
    // the same file are different lines. 5+40+2+7 = 54, 1+4 = 5.
    expect(panelTotals().textContent).toContain('+54');
    expect(panelTotals().textContent).toContain('−5');
  });

  it('a row shows the counts for the side it is listed on', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    // The same path, twice, with different numbers. Reading one numstat for
    // both sides would put 40 on the staged row and nobody would notice.
    const rows = row('src/a.ts');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('+5');
    expect(rows[1]?.textContent).toContain('+40');
  });

  it('the staging buttons still act on the row they sit on', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    // The rows moved into a shared component with the actions in a slot; the
    // one thing that must not have changed is which path a button stages.
    // `mutate()` schedules its `mutationFn` a tick out — `useGitOp` reads
    // `bridge()` and records an ops-journal entry ahead of the actual bridge
    // call — so the recorded call is asserted through `waitFor`, not read
    // synchronously off the click.
    fireEvent.click(screen.getByRole('button', { name: 'Stage src/nested/b.ts' }));

    await waitFor(() => expect(opsOf('stage')).toHaveLength(1));
    expect(opsOf('stage')[0]?.args.paths).toEqual(['src/nested/b.ts']);
  });

  it('View all changes shows every file, collapsed, with the panel totals at the top', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    fireEvent.click(screen.getByRole('button', { name: 'View all changes' }));

    // Same roll-up the panel already carries above the lists, now heading the
    // right pane too — no second, possibly-disagreeing total.
    await waitFor(() => expect(screen.getAllByTestId('change-totals')).toHaveLength(2));
    const totals = screen.getAllByTestId('change-totals');
    expect(totals[1]?.textContent).toContain('3 files');
    expect(totals[1]?.textContent).toContain('+54');
    expect(totals[1]?.textContent).toContain('−5');

    // Collapsed by default — this is a summary, not an eagerly-fetched wall of
    // diffs.
    expect(screen.queryByTestId('diff-view')).toBeNull();
    const accordionRow = (pattern: RegExp) =>
      [...document.querySelectorAll('button[aria-expanded]')].find((el) =>
        pattern.test(el.textContent ?? ''),
      );
    expect(accordionRow(/README\.md/)).toBeTruthy();

    // The staged-then-edited file is one row here, unlike the two it gets on
    // the left — there is nothing to stage in this view.
    expect(
      [...document.querySelectorAll('button[aria-expanded]')].filter((el) =>
        /a\.ts/.test(el.textContent ?? ''),
      ),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Expand all files' }));
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(3));
  });

  it('picking a file switches the pane back to its single diff, and back again', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    fireEvent.click(row('README.md')[0]!);
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'View all changes' }));
    expect(screen.queryByTestId('diff-view')).toBeNull();
    expect(
      [...document.querySelectorAll('button[aria-expanded]')].some((el) =>
        (el.textContent ?? '').includes('README.md'),
      ),
    ).toBe(true);

    fireEvent.click(row('src/nested/b.ts')[0]!);
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(1));
    expect(screen.queryByText('Select a file to see its diff.')).toBeNull();
  });

  /**
   * The commit box: an empty message costs no vertical space (no button, one
   * line of textarea), and both come back once there is something to commit.
   */
  it('the commit button only appears once a message is typed', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    expect(screen.queryByRole('button', { name: /^Commit/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Commit message'), {
      target: { value: 'fix: something' },
    });
    expect(await screen.findByRole('button', { name: /^Commit/ })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: '' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Commit/ })).toBeNull());
  });

  describe('stash from the Changes view', () => {
    it('Stash changes is disabled with a reason when there is nothing to stash', async () => {
      // Not waiting on the "Changes" heading: with zero entries the
      // TreeSection itself hides (`hideWhenEmpty` defaults true), so that
      // wait would fail for a reason that has nothing to do with this test —
      // the same hazard `e2e/changes-panel.spec.ts`'s own `open()` comment
      // named.
      open({ ...base, statusEntries: [] });

      const button = await screen.findByRole('button', { name: 'Stash changes' });
      // `IconButton` marks a disabled control with `aria-disabled` rather
      // than the native `disabled` attribute (it stays focusable, so a
      // `disabledReason` tooltip is reachable by keyboard) — no `jest-dom`
      // in this repo, per the house style, so the attribute is read directly.
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    it('the heading action stashes the whole worktree, with the checked options', async () => {
      open();
      await screen.findByRole('heading', { name: 'Changes' });

      fireEvent.click(screen.getByRole('button', { name: 'Stash changes' }));
      const dialog = await screen.findByRole('dialog', { name: 'Stash changes' });
      expect(dialog.textContent).toContain('the whole worktree');

      fireEvent.change(within(dialog).getByLabelText('Message (optional)'), {
        target: { value: 'wip' },
      });
      fireEvent.click(within(dialog).getByLabelText('Keep staged changes staged'));
      fireEvent.click(within(dialog).getByLabelText('Include untracked files'));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create stash' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(opsOf('stash.push')).toHaveLength(1));
      expect(opsOf('stash.push')[0]?.args).toEqual({
        repoId: 'repo-1',
        worktreePath: '/tmp/midnite-studio',
        message: 'wip',
        keepIndex: true,
        includeUntracked: true,
      });
    });

    it("a row's Stash file action scopes the stash to that one path, git's own defaults unchecked", async () => {
      open();
      await screen.findByRole('heading', { name: 'Changes' });

      fireEvent.click(screen.getByRole('button', { name: 'Stash file src/nested/b.ts' }));
      const dialog = await screen.findByRole('dialog', { name: 'Stash changes' });
      expect(dialog.textContent).toContain('src/nested/b.ts');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Create stash' }));

      await waitFor(() => expect(opsOf('stash.push')).toHaveLength(1));
      expect(opsOf('stash.push')[0]?.args).toEqual({
        repoId: 'repo-1',
        worktreePath: '/tmp/midnite-studio',
        message: undefined,
        keepIndex: false,
        includeUntracked: false,
        paths: ['src/nested/b.ts'],
      });
    });

    it('Cancel closes the dialog without calling stash.push', async () => {
      open();
      await screen.findByRole('heading', { name: 'Changes' });

      fireEvent.click(screen.getByRole('button', { name: 'Stash changes' }));
      const dialog = await screen.findByRole('dialog', { name: 'Stash changes' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(opsOf('stash.push')).toHaveLength(0);
    });
  });

  /** A section's fold toggle — accessible name is the title plus its item count. */
  const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });
  const isInert = (el: Element) => el.closest('[inert]') !== null;

  describe('Staged and Changes sections as accordions', () => {
    it('each section collapses and expands independently of the other', async () => {
      open();
      await screen.findByRole('heading', { name: 'Changes' });

      expect(section('Staged').getAttribute('aria-expanded')).toBe('true');
      expect(section('Changes').getAttribute('aria-expanded')).toBe('true');
      expect(isInert(row('src/a.ts')[0]!)).toBe(false);

      fireEvent.click(section('Staged'));
      expect(section('Staged').getAttribute('aria-expanded')).toBe('false');
      expect(isInert(row('src/a.ts')[0]!)).toBe(true);

      // The other section is untouched — collapsing one is not "collapse all".
      expect(section('Changes').getAttribute('aria-expanded')).toBe('true');
      expect(isInert(row('README.md')[0]!)).toBe(false);

      fireEvent.click(section('Staged'));
      expect(section('Staged').getAttribute('aria-expanded')).toBe('true');
      expect(isInert(row('src/a.ts')[0]!)).toBe(false);
    });
  });

  describe('unstaging a whole folder', () => {
    const folderStaged: MockFixtures = {
      ...fixtures,
      statusEntries: [
        entry('src/a.ts', { staged: 'modified' }),
        entry('src/b.ts', { staged: 'modified' }),
        entry('README.md', { unstaged: 'modified' }),
      ],
      statusCounts: {
        'staged:src/a.ts': { insertions: 1, deletions: 0 },
        'staged:src/b.ts': { insertions: 2, deletions: 0 },
        'unstaged:README.md': { insertions: 1, deletions: 0 },
      },
    };

    it('the folder action unstages every file inside it, not just the ones showing', async () => {
      open(folderStaged);
      await screen.findByRole('heading', { name: 'Changes' });

      fireEvent.click(screen.getByRole('button', { name: 'Group the changed files by folder' }));
      fireEvent.click(screen.getByRole('button', { name: 'Unstage folder src' }));

      await waitFor(() => expect(opsOf('unstage')).toHaveLength(1));
      expect([...(opsOf('unstage')[0]?.args.paths as string[])].sort()).toEqual([
        'src/a.ts',
        'src/b.ts',
      ]);
    });
  });
});
