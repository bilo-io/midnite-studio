import type { DiffHunk } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { canSplit, toSplitRows } from './split-diff-rows';

describe('split-diff-rows', () => {
  it('canSplit returns false for binary or combined diffs', () => {
    expect(
      canSplit({
        path: 'foo.bin',
        oldPath: null,
        change: 'modified',
        binary: true,
        combined: false,
        oldMode: null,
        newMode: null,
        hunks: [],
        insertions: 0,
        deletions: 0,
        contextLines: 3,
        truncated: false,
        droppedLines: 0,
      }),
    ).toBe(false);

    expect(
      canSplit({
        path: 'foo.txt',
        oldPath: null,
        change: 'modified',
        binary: false,
        combined: true,
        oldMode: null,
        newMode: null,
        hunks: [],
        insertions: 0,
        deletions: 0,
        contextLines: 3,
        truncated: false,
        droppedLines: 0,
      }),
    ).toBe(false);
  });

  it('pairs context lines identically on left and right', () => {
    const hunk: DiffHunk = {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      heading: '@@ -1,2 +1,2 @@',
      lines: [
        { kind: 'ctx', oldNo: 1, newNo: 1, text: 'hello', ranges: [], noNewline: false },
        { kind: 'ctx', oldNo: 2, newNo: 2, text: 'world', ranges: [], noNewline: false },
      ],
    };

    const rows = toSplitRows({
      path: 'foo.txt',
      oldPath: null,
      change: 'modified',
      binary: false,
      combined: false,
      oldMode: null,
      newMode: null,
      hunks: [hunk],
      insertions: 0,
      deletions: 0,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    });

    expect(rows).toHaveLength(3); // 1 hunk + 2 lines
    expect(rows[0]).toEqual({ kind: 'hunk', hunkIndex: 0, heading: '@@ -1,2 +1,2 @@', gap: null });
    expect(rows[1]).toEqual({
      kind: 'split-line',
      left: { line: hunk.lines[0], type: 'ctx' },
      right: { line: hunk.lines[0], type: 'ctx' },
    });
  });

  it('aligns del and add lines via sequence matching', () => {
    const hunk: DiffHunk = {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      heading: '@@ -1 +1 @@',
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'const a = 1;', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 1, text: 'const a = 2;', ranges: [], noNewline: false },
      ],
    };

    const rows = toSplitRows({
      path: 'foo.txt',
      oldPath: null,
      change: 'modified',
      binary: false,
      combined: false,
      oldMode: null,
      newMode: null,
      hunks: [hunk],
      insertions: 1,
      deletions: 1,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    });

    expect(rows).toHaveLength(2); // 1 hunk + 1 aligned split line
    expect(rows[1]).toEqual({
      kind: 'split-line',
      left: { line: hunk.lines[0], type: 'del' },
      right: { line: hunk.lines[1], type: 'add' },
    });
  });
});
