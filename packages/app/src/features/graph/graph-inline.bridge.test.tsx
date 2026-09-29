import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useUiStore } from '../../store/ui-store';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { GraphView } from './graph-view';

/**
 * The graph's expand-in-place panels, through the real bridge.
 *
 * Covers what jsdom can answer: which panel is open (one at a time, toggled
 * by the row), that the expansion lives in the store and so survives the
 * virtualizer unmounting the row, Escape's three cases (a menu open above
 * it, a focused commit box, nothing in the way), and a commit made from the
 * inline working-copy panel reaching `ops.commit`. The animated height and
 * the lanes running under the panel need real layout, and live in
 * `e2e/graph-inline-panels.spec.ts`.
 *
 * jsdom has no `Element.animate`, so `InlineExpander` resolves instantly — a
 * collapse unmounts the panel in the same act as the click.
 */

/** Distinct in the first seven characters, which is what the panel's label shows. */
const sha = (i: number) => i.toString(16).padStart(7, '0').padEnd(40, 'a');

/** A long straight history — enough rows that the virtualizer must drop some. */
const ROWS = Array.from({ length: 200 }, (_, i) => ({
  row: i,
  commit: {
    sha: sha(i + 1),
    parents: i < 199 ? [sha(i + 2)] : [],
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    authorDate: 1_787_000_000 - i * 60,
    committerDate: 1_787_000_000 - i * 60,
    subject: `commit number ${i + 1}`,
    refs: [],
  },
  lane: 0,
  colorIdx: 0,
  edges: [{ fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 }],
  laneCount: 1,
}));

const detail = (i: number) => ({
  sha: sha(i),
  parents: [sha(i + 1)],
  subject: `commit number ${i}`,
  body: `commit number ${i}`,
  author: { name: 'Ada Lovelace', email: 'ada@example.com', date: 1_787_000_000 },
  committer: { name: 'Ada Lovelace', email: 'ada@example.com', date: 1_787_000_000 },
  files: [
    { path: 'src/one.ts', oldPath: null, insertions: 1, deletions: 0 },
    { path: 'src/two.ts', oldPath: null, insertions: 2, deletions: 1 },
  ],
});

const entry = (path: string, staged: string, unstaged: string) => ({
  path,
  origPath: null,
  staged,
  unstaged,
  conflicted: false,
  similarity: null,
});

const DATA: MockFixtures = {
  ...fixtures,
  graphRows: ROWS,
  commitDetails: { [sha(1)]: detail(1), [sha(2)]: detail(2), [sha(3)]: detail(3) },
  statusEntries: [entry('src/staged.ts', 'modified', 'unmodified'), entry('README.md', 'unmodified', 'modified')],
};

const open = (data: MockFixtures = DATA) =>
  renderView(<GraphView />, {
    fixtures: data,
    uiState: { selectedRepoId: 'repo-1', activeView: 'graph', graphSelection: null },
  });

/** The graph row — the open panel repeats the subject in its message. */
const rowFor = (subject: string) => {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(subject, { exact: true }) !== null);
  if (!row) throw new Error(`no row for ${subject}`);
  return row;
};
const panelFor = (i: number) => screen.queryByRole('region', { name: `Commit ${sha(i).slice(0, 7)} details` });
const workingPanel = () => screen.queryByRole('region', { name: 'Working copy changes' });
const escape = (target: Element | Window = window) => fireEvent.keyDown(target, { key: 'Escape' });

afterEach(() => {
  cleanup();
  useUiStore.setState({ graphSelection: null });
  useCommitBoxStore.setState({ drafts: {} });
});

describe('inline panels in the git graph', () => {
  it('a commit row expands its details underneath it, and a second click collapses them', async () => {
    open();
    await screen.findByText('commit number 1', { exact: true });

    fireEvent.click(rowFor('commit number 1'));
    const panel = await waitFor(() => {
      const found = panelFor(1);
      expect(found).not.toBeNull();
      return found!;
    });
    // Directly under its own row: the slot shares the row's wrapper.
    expect(rowFor('commit number 1').parentElement!.contains(panel)).toBe(true);
    // The split inspector, not the right-hand aside.
    await waitFor(() => expect(panel.querySelector('[data-commit-layout="split"]')).not.toBeNull());
    expect(document.querySelector('aside')).toBeNull();

    fireEvent.click(rowFor('commit number 1'));
    await waitFor(() => expect(panelFor(1)).toBeNull());
    expect(useUiStore.getState().graphSelection).toBeNull();
  });

  it('only one row is expanded at a time — opening another collapses the first', async () => {
    open();
    await screen.findByText('commit number 1', { exact: true });

    fireEvent.click(rowFor('commit number 1'));
    await waitFor(() => expect(panelFor(1)).not.toBeNull());

    fireEvent.click(rowFor('commit number 2'));
    await waitFor(() => expect(panelFor(2)).not.toBeNull());
    expect(panelFor(1)).toBeNull();

    // The working copy is one of the rows too.
    fireEvent.click(screen.getByTestId('uncommitted-row'));
    await waitFor(() => expect(workingPanel()).not.toBeNull());
    expect(panelFor(2)).toBeNull();
    expect(useUiStore.getState().graphSelection).toEqual({ kind: 'working-tree' });
  });

  it('the expansion survives its row being scrolled out of the virtual window and back', async () => {
    open();
    await screen.findByText('commit number 1', { exact: true });
    fireEvent.click(rowFor('commit number 1'));
    await waitFor(() => expect(panelFor(1)).not.toBeNull());

    const scroller = screen.getByRole('grid');
    act(() => {
      scroller.scrollTop = 190 * 40;
      fireEvent.scroll(scroller);
    });
    // Row 1 is far outside the rendered window now, panel and all.
    await waitFor(() =>
      expect(
        screen.queryAllByRole('row').some((row) => within(row).queryByText('commit number 1', { exact: true })),
      ).toBe(false),
    );
    expect(useUiStore.getState().graphSelection).toEqual({ kind: 'commit', sha: sha(1) });

    act(() => {
      scroller.scrollTop = 0;
      fireEvent.scroll(scroller);
    });
    await waitFor(() => expect(panelFor(1)).not.toBeNull());
  });

  describe('Escape', () => {
    it('collapses the open panel when nothing is in the way', async () => {
      open();
      await screen.findByText('commit number 1', { exact: true });
      fireEvent.click(rowFor('commit number 1'));
      await waitFor(() => expect(panelFor(1)).not.toBeNull());

      escape();
      await waitFor(() => expect(panelFor(1)).toBeNull());
    });

    it('closes an open context menu first, and leaves the panel open', async () => {
      open();
      await screen.findByText('commit number 2', { exact: true });
      fireEvent.click(rowFor('commit number 2'));
      await waitFor(() => expect(panelFor(2)).not.toBeNull());

      // Right-click the OPEN row: the menu opens and the row stays expanded.
      fireEvent.contextMenu(rowFor('commit number 2'), { clientX: 40, clientY: 40 });
      const menu = await screen.findByRole('menu');
      expect(panelFor(2)).not.toBeNull();

      escape(menu);
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(panelFor(2)).not.toBeNull();

      escape();
      await waitFor(() => expect(panelFor(2)).toBeNull());
    });

    it('while typing in the commit box, only blurs it — the next Escape collapses', async () => {
      open();
      await screen.findByTestId('uncommitted-row');
      fireEvent.click(screen.getByTestId('uncommitted-row'));
      const panel = await waitFor(() => {
        const found = workingPanel();
        expect(found).not.toBeNull();
        return found!;
      });

      const box = within(panel).getByPlaceholderText('Commit message');
      act(() => box.focus());
      fireEvent.change(box, { target: { value: 'wip' } });
      escape(box);
      expect(document.activeElement).not.toBe(box);
      expect(workingPanel()).not.toBeNull();

      escape();
      await waitFor(() => expect(workingPanel()).toBeNull());
    });

    it('is left alone while any other text field has focus', async () => {
      open();
      await screen.findByText('commit number 1', { exact: true });
      fireEvent.click(rowFor('commit number 1'));
      await waitFor(() => expect(panelFor(1)).not.toBeNull());

      // A stand-in for the terminal's or Monaco's hidden textarea.
      const field = document.createElement('textarea');
      document.body.append(field);
      act(() => field.focus());
      escape(field);
      expect(panelFor(1)).not.toBeNull();
      field.remove();
    });
  });

  it('commits from the inline working-copy panel', async () => {
    open();
    await screen.findByTestId('uncommitted-row');
    fireEvent.click(screen.getByTestId('uncommitted-row'));
    const panel = await waitFor(() => {
      const found = workingPanel();
      expect(found).not.toBeNull();
      return found!;
    });

    fireEvent.change(within(panel).getByPlaceholderText('Commit message'), {
      target: { value: 'feat: from the graph' },
    });
    const button = await within(panel).findByRole('button', { name: 'Commit 1 file' });
    // The app's gradient button treatment.
    expect(button.className).toContain('loop-start-gradient');
    fireEvent.click(button);

    await waitFor(() => {
      const ops = (window as unknown as { __mstudioOps: { op: string; args: unknown }[] }).__mstudioOps;
      expect(ops.filter((call) => call.op === 'commit')).toEqual([
        { op: 'commit', args: expect.objectContaining({ message: 'feat: from the graph' }) },
      ]);
    });
  });

  it('holds the Mod+Enter commit handle only while the graph shows the working-copy panel', async () => {
    open();
    await screen.findByTestId('uncommitted-row');
    const before = useCommitBoxStore.getState().handles.length;

    fireEvent.click(screen.getByTestId('uncommitted-row'));
    await waitFor(() => expect(useCommitBoxStore.getState().handles.length).toBe(before + 1));

    fireEvent.click(screen.getByTestId('uncommitted-row'));
    await waitFor(() => expect(useCommitBoxStore.getState().handles.length).toBe(before));
  });
});
