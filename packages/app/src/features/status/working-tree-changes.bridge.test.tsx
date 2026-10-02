import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { WorkingTreeInlinePanel } from '../graph/graph-inline-panels';

/**
 * The working tree's parts — `working-tree-changes.tsx` — in their one host,
 * the git graph's inline working-copy panel. (The standalone Changes view that
 * used to be the second host is gone.)
 */

const entry = (path: string, staged: string, unstaged: string) => ({
  path,
  origPath: null,
  staged,
  unstaged,
  conflicted: false,
  similarity: null,
});

const diffFor = (path: string) => ({
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
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'old', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 1, text: 'new', ranges: [], noNewline: false },
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

const DATA: MockFixtures = {
  ...fixtures,
  statusEntries: [
    entry('src/staged.ts', 'modified', 'unmodified'),
    entry('src/one.ts', 'unmodified', 'modified'),
    entry('src/two.ts', 'unmodified', 'modified'),
  ],
  diffs: {
    'wt:src/staged.ts': diffFor('src/staged.ts'),
    'wt:src/one.ts': diffFor('src/one.ts'),
    'wt:src/two.ts': diffFor('src/two.ts'),
  },
};

const UI = { selectedRepoId: 'repo-1', selectedWorktreePath: '/tmp/midnite-studio', activeView: 'graph' as const };


afterEach(() => {
  cleanup();
  useCommitBoxStore.setState({ drafts: {} });
  vi.restoreAllMocks();
});

describe('the working-tree parts in the graph inline panel', () => {
  const open = (data: MockFixtures = DATA) =>
    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: data, uiState: UI });

  it('lists both sides with their bulk actions, the view toggle and the commit box', async () => {
    open();
    await screen.findByRole('heading', { name: 'Staged' });
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unstage all' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stage all' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Group the changed files by folder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View all changes' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Commit message')).toBeTruthy();
  });

  it('discarding a file still asks first, and does nothing on cancel', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes src/one.ts' }));

    expect(confirm).toHaveBeenCalledWith('Discard changes to src/one.ts? This cannot be undone.');
    const ops = (window as unknown as { __mstudioOps: { op: string }[] }).__mstudioOps;
    expect(ops.filter((call) => call.op === 'discard')).toHaveLength(0);
  });

  it('Cmd/Ctrl-click picks several files, and the diff side opens all of them', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes' });

    fireEvent.click(screen.getByRole('button', { name: 'src/one.ts' }));
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'src/two.ts' }), { metaKey: true });
    // Both files, already expanded — choosing them was asking to read them.
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'src/one.ts' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'src/two.ts' }).getAttribute('aria-pressed')).toBe('true');

    // A plain click goes back to one.
    fireEvent.click(screen.getByRole('button', { name: 'src/two.ts' }));
    await waitFor(() => expect(screen.getAllByTestId('diff-view')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'src/one.ts' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('the Commit button is the brand-gradient button, disabled with nothing staged', async () => {
    open({ ...DATA, statusEntries: [entry('src/one.ts', 'unmodified', 'modified')] });
    await screen.findByRole('heading', { name: 'Changes' });

    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'wip' } });
    const button = (await screen.findByTestId('commit-button')) as HTMLButtonElement;
    expect(button.className).toContain('brand-gradient-button');
    // Its disabled look (no glow, desaturated fill) keys on `:disabled` in
    // styles.css rather than on utilities, so the class list is the same in
    // both states — only the attribute differs.
    expect(button.disabled).toBe(true);
    expect(button.className).not.toMatch(/disabled:opacity|loop-start-gradient|text-foreground/);
  });

  it('enables the brand-gradient Commit once something is staged', async () => {
    open();
    await screen.findByRole('heading', { name: 'Staged' });

    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'wip' } });
    const button = (await screen.findByTestId('commit-button')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.className).toContain('brand-gradient-button');
    expect(button.textContent).toBe('Commit 1 file');
  });
});

describe('the panel layout', () => {
  it('has one close button, last in the diff header, and the commit box after the file list', async () => {
    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(screen.queryByTestId('diff-viewer-header')).toBeNull();
    const header = closes[0]!.closest('header')!;
    const kids = Array.from(header.children);
    expect(kids[kids.length - 1]).toBe(closes[0]);
    expect(kids.indexOf(screen.getByRole('button', { name: 'Collapse all files' }))).toBeLessThan(kids.length - 1);
    const input = screen.getByPlaceholderText('Commit message');
    const heading = screen.getByRole('heading', { name: 'Changes' });
    expect(heading.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('bolds the totals', async () => {
    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    expect(screen.getAllByTestId('change-totals')[0]!.querySelector('.font-bold')).not.toBeNull();
  });
});

describe('what the panel shows with nothing picked', () => {
  it('shows every changed file, collapsed', async () => {
    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    expect(screen.queryByText('Select a file to see its diff.')).toBeNull();
    expect(screen.getByRole('button', { name: 'View all changes' }).getAttribute('aria-pressed')).toBe('true');
    const accordion = screen.getByRole('button', { name: 'Expand all files' }).closest('div')!.parentElement!;
    expect(within(accordion).getAllByRole('button', { expanded: false }).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps its draft message across the panel closing and reopening', async () => {
    const first = renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'half a thought' } });
    first.unmount();

    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    expect((screen.getByPlaceholderText('Commit message') as HTMLTextAreaElement).value).toBe('half a thought');
  });
});
