// vitest/jsdom: the History timeline, branch picker and commit detail over a fake data source (Phase 146 Theme G).
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Commit } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerCalls } from '../../test/mocks/expo-router';
import { renderInShell, resetShellState } from '../../test/shell-harness';
import { fail, ok } from '../data/source';
import { usePrefs } from '../state/prefs';
import { BranchSheet, filterBranches } from './branch-sheet';
import { CommitDetailScreen } from './commit-detail-screen';
import { HistoryScreen } from './history-screen';

const repo = { owner: 'bilo-io', name: 'midnite-studio', defaultBranch: 'main' };
const viewer = ok({ login: 'octo', name: 'Octo Cat', avatarUrl: null });
const sha = (c: string) => c.repeat(40);
const now = Math.floor(Date.now() / 1000);
const commit = (c: string, parents: string[] = [sha('0')], subject = `subject ${c}`): Commit => ({
  sha: sha(c),
  parents,
  authorName: 'Ada',
  authorEmail: 'a@x',
  authorDate: now - 60,
  committerDate: now - 60,
  subject,
  refs: [],
  coAuthors: [],
  sessionTrailers: [],
});
const SLOW = { timeout: 4000 };
const page = (items: unknown[], nextCursor: string | null = null) => ok({ items, nextCursor });

beforeEach(() => {
  routerCalls.length = 0;
  resetShellState({ currentRepo: repo });
});
afterEach(cleanup);

describe('HistoryScreen', () => {
  it('renders commits with a hollow dot for a merge and a filled head dot', async () => {
    const history = vi.fn(async () => page([commit('a'), commit('b', [sha('1'), sha('2')], 'Merge pull request #1'), commit('c')]));
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history });
    expect(await screen.findByText('subject a')).toBeTruthy();
    expect(screen.getByText('Merge pull request #1')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getAllByTestId('rail-dot-merge')).toHaveLength(1);
    expect(screen.getAllByTestId('rail-dot-head')).toHaveLength(1);
    expect(screen.getByText('aaaaaaa')).toBeTruthy();
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ name: 'midnite-studio' }), 'main', null);
  });

  it('opens a commit on press', async () => {
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history: async () => page([commit('a')]) });
    fireEvent.click(await screen.findByTestId('commit-row-aaaaaaa'));
    expect(routerCalls.at(-1)).toEqual({ method: 'push', href: `/history/${sha('a')}` });
  });

  it('asks to pick a repository when none is selected', async () => {
    resetShellState({ currentRepo: null });
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history: vi.fn() });
    fireEvent.click(await screen.findByText('Choose repository'));
    expect((await screen.findByTestId('probe')).textContent).toContain('switcher:true');
  });

  it('says so when the branch has no commits', async () => {
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history: async () => page([]) });
    expect(await screen.findByText('No commits on main')).toBeTruthy();
  });

  it('shows an inline retry row on a network failure and retries', async () => {
    const history = vi.fn().mockResolvedValueOnce(fail('network', 'offline')).mockResolvedValueOnce(fail('network', 'offline')).mockResolvedValue(page([commit('a')]));
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history });
    // The query client retries once after 1 s before the error state shows.
    fireEvent.click(await screen.findByText('Retry', {}, SLOW));
    expect(await screen.findByText('subject a')).toBeTruthy();
  });

  it('shows a full error state for a non-network failure', async () => {
    await renderInShell(<HistoryScreen />, { viewer: async () => viewer, history: async () => fail('error', 'boom') });
    expect(await screen.findByTestId('history-error', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });
});

describe('BranchSheet', () => {
  it('lists branches, filters, and stores the pick per repo', async () => {
    const onOpenChange = vi.fn();
    const listBranches = vi.fn(async () => page(['main', 'release', 'feature/x']));
    await renderInShell(<BranchSheet repo={repo} current="main" open onOpenChange={onOpenChange} />, { viewer: async () => viewer, listBranches });
    expect(await screen.findByText('release')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter branches'), { target: { value: 'feat' } });
    expect(screen.queryByText('release')).toBeNull();
    fireEvent.click(screen.getByText('feature/x'));
    expect(usePrefs.getState().branchByRepo['bilo-io/midnite-studio']).toBe('feature/x');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('filterBranches', () => {
  it('filters case-insensitively and pins the current branch first', () => {
    expect(filterBranches(['dev', 'main', 'Feature/x'], '', 'main')).toEqual(['main', 'dev', 'Feature/x']);
    expect(filterBranches(['dev', 'main', 'Feature/x'], 'FEAT', 'main')).toEqual(['Feature/x']);
    expect(filterBranches(['dev'], 'zzz', null)).toEqual([]);
  });
});

describe('CommitDetailScreen', () => {
  const file = (path: string, over = {}) => ({
    path,
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    hunks: [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        heading: '',
        lines: [
          { kind: 'del', oldNo: 1, newNo: null, text: 'old line', ranges: [], noNewline: false },
          { kind: 'add', oldNo: null, newNo: 1, text: 'new line', ranges: [], noNewline: false },
        ],
      },
    ],
    insertions: 1,
    deletions: 1,
    contextLines: 3,
    combined: false,
    truncated: false,
    droppedLines: 0,
    ...over,
  });
  const detail = () =>
    ok({
      commit: { ...commit('a', [sha('b'), sha('c')]), authorName: 'Ada' },
      message: 'feat: add thing\n\nlonger body text',
      committerName: 'Grace',
      files: [file('src/a.ts'), file('img.png', { binary: true, hunks: [], insertions: 0, deletions: 0 })],
    });

  it('shows the message, people, parents and files', async () => {
    await renderInShell(<CommitDetailScreen sha={sha('a')} />, { viewer: async () => viewer, commit: async () => detail() });
    expect(await screen.findByText(/feat: add thing/)).toBeTruthy();
    expect(screen.getByText(/Authored by Ada/)).toBeTruthy();
    expect(screen.getByText(/Committed by Grace/)).toBeTruthy();
    expect(screen.getByText('Parents (merge)')).toBeTruthy();
    expect(screen.getByText('+1 −1')).toBeTruthy();
    expect(screen.getByText('binary')).toBeTruthy();
  });

  it('navigates to a parent', async () => {
    await renderInShell(<CommitDetailScreen sha={sha('a')} />, { viewer: async () => viewer, commit: async () => detail() });
    fireEvent.click(await screen.findByTestId('parent-bbbbbbb'));
    expect(routerCalls.at(-1)).toEqual({ method: 'push', href: `/history/${sha('b')}` });
  });

  it('opens a file diff and returns to the list', async () => {
    await renderInShell(<CommitDetailScreen sha={sha('a')} />, { viewer: async () => viewer, commit: async () => detail() });
    fireEvent.click(await screen.findByTestId('file-src/a.ts'));
    expect(await screen.findByText(/new line/)).toBeTruthy();
    expect(screen.getByText(/old line/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByTestId('commit-detail')).toBeTruthy();
  });

  it('says a binary file has no diff', async () => {
    await renderInShell(<CommitDetailScreen sha={sha('a')} />, { viewer: async () => viewer, commit: async () => detail() });
    fireEvent.click(await screen.findByTestId('file-img.png'));
    expect(await screen.findByTestId('diff-binary')).toBeTruthy();
  });

  it('offers a retry when loading fails', async () => {
    const commitFn = vi.fn().mockResolvedValueOnce(fail('network', 'offline')).mockResolvedValueOnce(fail('network', 'offline')).mockResolvedValue(detail());
    await renderInShell(<CommitDetailScreen sha={sha('a')} />, { viewer: async () => viewer, commit: commitFn });
    // The query client retries once after 1 s before the error state shows.
    fireEvent.click(await screen.findByText('Retry', {}, SLOW));
    expect(await screen.findByText(/feat: add thing/)).toBeTruthy();
  });
});
