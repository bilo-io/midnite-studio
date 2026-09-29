import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { WorkingTreeInlinePanel } from '../graph/graph-inline-panels';
import { StatusPanel } from './status-panel';

/**
 * The working tree's shared parts — `working-tree-changes.tsx` — in both of
 * their hosts: the Changes view (`StatusPanel`) and the git graph's inline
 * working-copy panel. Each assertion runs against both, because the whole
 * point of lifting the parts out was that the two cannot drift.
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

const HOSTS = [
  ['the Changes view', () => <StatusPanel />],
  ['the graph inline panel', () => <WorkingTreeInlinePanel active onClose={() => {}} />],
] as const;

afterEach(() => {
  cleanup();
  useCommitBoxStore.setState({ drafts: {} });
  vi.restoreAllMocks();
});

describe.each(HOSTS)('the working-tree parts in %s', (_name, host) => {
  const open = (data: MockFixtures = DATA) => renderView(host(), { fixtures: data, uiState: UI });

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

  it('the Commit button wears the gradient treatment, and stays readable when disabled', async () => {
    open({ ...DATA, statusEntries: [entry('src/one.ts', 'unmodified', 'modified')] });
    await screen.findByRole('heading', { name: 'Changes' });

    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'wip' } });
    const button = await screen.findByTestId('commit-button');
    expect(button.className).toContain('loop-start-gradient');
    // Nothing staged: disabled, dimmed — and no glow, because every hover rule
    // on the class is `:not(:disabled)`.
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).toContain('disabled:opacity-50');
  });
});

describe('what each host shows with nothing picked', () => {
  it('the Changes view asks for a file', async () => {
    renderView(<StatusPanel />, { fixtures: DATA, uiState: UI });
    expect(await screen.findByText('Select a file to see its diff.')).toBeTruthy();
  });

  it('the graph panel shows every changed file, collapsed', async () => {
    renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    expect(screen.queryByText('Select a file to see its diff.')).toBeNull();
    expect(screen.getByRole('button', { name: 'View all changes' }).getAttribute('aria-pressed')).toBe('true');
    const accordion = screen.getByRole('button', { name: 'Expand all files' }).closest('div')!.parentElement!;
    expect(within(accordion).getAllByRole('button', { expanded: false }).length).toBeGreaterThanOrEqual(3);
  });

  it('shares its draft message with the Changes view', async () => {
    const first = renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'half a thought' } });
    first.unmount();

    renderView(<StatusPanel />, { fixtures: DATA, uiState: UI });
    await screen.findByRole('heading', { name: 'Changes' });
    expect((screen.getByPlaceholderText('Commit message') as HTMLTextAreaElement).value).toBe('half a thought');
  });
});
