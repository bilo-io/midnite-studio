import type { DiffHunk, DiffLine, FileDiff } from '@midnite/studio-shared';
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

  it('canSplit returns true for zero-hunk diff, and toSplitRows returns empty array', () => {
    const emptyDiff: FileDiff = {
      path: 'empty.txt',
      oldPath: null,
      change: 'modified',
      binary: false,
      combined: false,
      oldMode: null,
      newMode: null,
      hunks: [],
      insertions: 0,
      deletions: 0,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    };

    expect(canSplit(emptyDiff)).toBe(true);
    expect(toSplitRows(emptyDiff)).toEqual([]);
  });

  describe('alignment matrix', () => {
    const makeLine = (
      kind: DiffLine['kind'],
      text: string,
      oldNo: number | null,
      newNo: number | null,
    ): DiffLine => ({
      kind,
      oldNo,
      newNo,
      text,
      ranges: [],
      noNewline: false,
    });

    const makeDiff = (
      hunks: DiffHunk[],
      change: 'modified' | 'added' | 'deleted' = 'modified',
    ): FileDiff => ({
      path: 'foo.txt',
      oldPath: null,
      change,
      binary: false,
      combined: false,
      oldMode: null,
      newMode: null,
      hunks,
      insertions: hunks.flatMap((h) => h.lines).filter((l) => l.kind === 'add').length,
      deletions: hunks.flatMap((h) => h.lines).filter((l) => l.kind === 'del').length,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    });

    it('handles a balanced 3-for-3 run', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        heading: '@@ -1,3 +1,3 @@',
        lines: [
          makeLine('del', 'line 1 old', 1, null),
          makeLine('del', 'line 2 old', 2, null),
          makeLine('del', 'line 3 old', 3, null),
          makeLine('add', 'line 1 new', null, 1),
          makeLine('add', 'line 2 new', null, 2),
          makeLine('add', 'line 3 new', null, 3),
        ],
      };

      const rows = toSplitRows(makeDiff([hunk]));
      expect(rows).toHaveLength(4); // 1 hunk + 3 split lines
      const splitLines = rows.filter((r) => r.kind === 'split-line');
      expect(splitLines).toHaveLength(3);
      for (const row of splitLines) {
        if (row.kind === 'split-line') {
          expect(row.left.type).toBe('del');
          expect(row.right.type).toBe('add');
        }
      }
    });

    it('handles unbalanced 5-for-2 and 2-for-5 runs', () => {
      // 5 dels for 2 adds
      const hunk5for2: DiffHunk = {
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: 2,
        heading: '@@ -1,5 +1,2 @@',
        lines: [
          makeLine('del', 'd1', 1, null),
          makeLine('del', 'd2', 2, null),
          makeLine('del', 'd3', 3, null),
          makeLine('del', 'd4', 4, null),
          makeLine('del', 'd5', 5, null),
          makeLine('add', 'd1 modified', null, 1),
          makeLine('add', 'd2 modified', null, 2),
        ],
      };

      const rows5for2 = toSplitRows(makeDiff([hunk5for2]));
      const lines5for2 = rows5for2.filter((r) => r.kind === 'split-line');
      expect(lines5for2).toHaveLength(5);
      // Surplus dels must have empty opposite and never empty on both sides
      const emptyRight = lines5for2.filter((r) => r.kind === 'split-line' && r.right.type === 'empty');
      expect(emptyRight).toHaveLength(3);
      for (const r of lines5for2) {
        if (r.kind === 'split-line') {
          expect(r.left.type === 'empty' && r.right.type === 'empty').toBe(false);
        }
      }

      // 2 dels for 5 adds
      const hunk2for5: DiffHunk = {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 5,
        heading: '@@ -1,2 +1,5 @@',
        lines: [
          makeLine('del', 'a1', 1, null),
          makeLine('del', 'a2', 2, null),
          makeLine('add', 'a1 modified', null, 1),
          makeLine('add', 'a2 modified', null, 2),
          makeLine('add', 'a3 extra', null, 3),
          makeLine('add', 'a4 extra', null, 4),
          makeLine('add', 'a5 extra', null, 5),
        ],
      };

      const rows2for5 = toSplitRows(makeDiff([hunk2for5]));
      const lines2for5 = rows2for5.filter((r) => r.kind === 'split-line');
      expect(lines2for5).toHaveLength(5);
      const emptyLeft = lines2for5.filter((r) => r.kind === 'split-line' && r.left.type === 'empty');
      expect(emptyLeft).toHaveLength(3);
      for (const r of lines2for5) {
        if (r.kind === 'split-line') {
          expect(r.left.type === 'empty' && r.right.type === 'empty').toBe(false);
        }
      }
    });

    it('handles a pure addition against an empty file', () => {
      const hunk: DiffHunk = {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 3,
        heading: '@@ -0,0 +1,3 @@',
        lines: [
          makeLine('add', 'first', null, 1),
          makeLine('add', 'second', null, 2),
          makeLine('add', 'third', null, 3),
        ],
      };

      const rows = toSplitRows(makeDiff([hunk], 'added'));
      expect(rows).toHaveLength(4); // 1 hunk + 3 additions
      const splitLines = rows.filter((r) => r.kind === 'split-line');
      expect(splitLines).toHaveLength(3);
      for (const r of splitLines) {
        if (r.kind === 'split-line') {
          expect(r.left.type).toBe('empty');
          expect(r.left.line).toBeNull();
          expect(r.right.type).toBe('add');
          expect(r.right.line).not.toBeNull();
        }
      }
    });

    it('handles a pure deletion', () => {
      const hunk: DiffHunk = {
        oldStart: 1,
        oldLines: 2,
        newStart: 0,
        newLines: 0,
        heading: '@@ -1,2 +0,0 @@',
        lines: [
          makeLine('del', 'delete me 1', 1, null),
          makeLine('del', 'delete me 2', 2, null),
        ],
      };

      const rows = toSplitRows(makeDiff([hunk], 'deleted'));
      expect(rows).toHaveLength(3); // 1 hunk + 2 deletions
      const splitLines = rows.filter((r) => r.kind === 'split-line');
      expect(splitLines).toHaveLength(2);
      for (const r of splitLines) {
        if (r.kind === 'split-line') {
          expect(r.left.type).toBe('del');
          expect(r.left.line).not.toBeNull();
          expect(r.right.type).toBe('empty');
          expect(r.right.line).toBeNull();
        }
      }
    });

    it('computes hunk gap between successive hunks', () => {
      const hunk1: DiffHunk = {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        heading: '@@ -1,2 +1,2 @@',
        lines: [
          makeLine('ctx', 'ctx 1', 1, 1),
          makeLine('ctx', 'ctx 2', 2, 2),
        ],
      };

      const hunk2: DiffHunk = {
        oldStart: 10,
        oldLines: 2,
        newStart: 10,
        newLines: 2,
        heading: '@@ -10,2 +10,2 @@',
        lines: [
          makeLine('ctx', 'ctx 10', 10, 10),
          makeLine('ctx', 'ctx 11', 11, 11),
        ],
      };

      const rows = toSplitRows(makeDiff([hunk1, hunk2]));
      expect(rows[0]).toEqual({
        kind: 'hunk',
        hunkIndex: 0,
        heading: '@@ -1,2 +1,2 @@',
        gap: null,
      });
      // hunk1 ends at newStart(1) + newLines(2) = 3
      // hunk2 starts at 10. Gap is 10 - 3 = 7.
      expect(rows[3]).toEqual({
        kind: 'hunk',
        hunkIndex: 1,
        heading: '@@ -10,2 +10,2 @@',
        gap: 7,
      });
    });
  });
});
