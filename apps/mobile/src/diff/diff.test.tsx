// vitest/jsdom: the shared diff viewer and its pure helpers (Phase 146 Theme I4).
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { DiffLine, FileDiff } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';
import { renderInShell, resetShellState } from '../../test/shell-harness';
import { DiffView } from './diff-view';
import { excerptOf, fileFromHunkText, gutterNumbers, hunkHeader, isLargeDiff, rowsForHunk, segmentsOf } from './diff-rows';

const line = (kind: DiffLine['kind'], oldNo: number | null, newNo: number | null, text: string, ranges: DiffLine['ranges'] = []): DiffLine => ({
  kind, oldNo, newNo, text, ranges, noNewline: false,
});
const hunk = { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, heading: 'fn()', lines: [line('ctx', 1, 1, 'keep'), line('del', 2, null, 'old value', [{ start: 4, end: 9 }]), line('add', null, 2, 'new value', [{ start: 4, end: 9 }])] };
const file = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: 'a.ts', oldPath: null, change: 'modified', binary: false, oldMode: null, newMode: null, hunks: [hunk],
  insertions: 1, deletions: 1, contextLines: 3, combined: false, truncated: false, droppedLines: 0, ...over,
});

afterEach(cleanup);

describe('diff helpers', () => {
  it('gutterNumbers leaves the missing side blank', () => {
    expect(gutterNumbers(line('add', null, 7, 'x'))).toEqual({ old: '', new: '7' });
    expect(gutterNumbers(line('del', 3, null, 'x'))).toEqual({ old: '3', new: '' });
  });
  it('rowsForHunk puts the header first', () => {
    const rows = rowsForHunk(hunk, 0);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ kind: 'hunk', key: 'h0', text: '@@ -1,2 +1,2 @@ fn()' });
    expect(hunkHeader({ ...hunk, heading: '' })).toBe('@@ -1,2 +1,2 @@');
  });
  it('segmentsOf splits on clamped ranges', () => {
    expect(segmentsOf('old value', [{ start: 4, end: 99 }])).toEqual([{ text: 'old ', changed: false }, { text: 'value', changed: true }]);
    expect(segmentsOf('abc', [])).toEqual([{ text: 'abc', changed: false }]);
  });
  it('flags diffs over 2,000 lines', () => {
    const big = file({ hunks: [{ ...hunk, lines: Array.from({ length: 2001 }, (_, i) => line('add', null, i + 1, 'x')) }] });
    expect(isLargeDiff(big)).toBe(true);
    expect(isLargeDiff(file())).toBe(false);
  });
  it('parses a diffHunk and keeps the last lines as the excerpt', () => {
    const f = fileFromHunkText('a.ts', '@@ -1,3 +1,4 @@\n a\n b\n+c\n d\n e\n f\n g');
    expect(f?.hunks[0]?.lines.length).toBeGreaterThan(6);
    expect(excerptOf(f!, 6).hunks[0]?.lines).toHaveLength(6);
    expect(fileFromHunkText('a.ts', '')).toBeNull();
  });
});

describe('DiffView', () => {
  it('renders hunk header, add and delete rows', async () => {
    resetShellState();
    await renderInShell(<DiffView file={file()} />);
    expect(screen.getByTestId('diff-hunk')).toBeTruthy();
    expect(screen.getAllByTestId('diff-line-add')).toHaveLength(1);
    expect(screen.getAllByTestId('diff-line-del')).toHaveLength(1);
  });
  it('says so for a binary file', async () => {
    resetShellState();
    await renderInShell(<DiffView file={file({ binary: true, hunks: [] })} />);
    expect(screen.getByTestId('diff-binary')).toBeTruthy();
  });
  it('toggles to horizontal scroll', async () => {
    resetShellState();
    await renderInShell(<DiffView file={file()} />);
    fireEvent.click(screen.getByTestId('diff-wrap-toggle'));
    expect(screen.getByTestId('diff-hscroll')).toBeTruthy();
  });
  it('gates a large diff until asked', async () => {
    resetShellState();
    const big = file({ hunks: [{ ...hunk, lines: Array.from({ length: 2001 }, (_, i) => line('add', null, i + 1, 'x')) }] });
    await renderInShell(<DiffView file={big} />);
    expect(screen.getByTestId('diff-gate')).toBeTruthy();
    fireEvent.click(screen.getByText('Load full diff'));
    expect(screen.getByTestId('diff-view')).toBeTruthy();
  });
  it('compact mode renders in place without a toggle', async () => {
    resetShellState();
    await renderInShell(<DiffView file={file()} compact />);
    expect(screen.getByTestId('diff-compact')).toBeTruthy();
    expect(screen.queryByTestId('diff-wrap-toggle')).toBeNull();
  });
});
