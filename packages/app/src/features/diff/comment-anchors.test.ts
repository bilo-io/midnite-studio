import type { DiffLine, FileDiff, ForgeReviewThread } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  isAnchored,
  isCommentableLine,
  positionForLine,
  rightSideLines,
  threadsForFile,
} from './comment-anchors';

/**
 * The two mappings a review comment depends on.
 *
 * Both fail in the same expensive way — a comment attributed to the wrong line
 * of somebody else's pull request — and both fail *silently*, because a
 * misanchored thread renders exactly like a correct one. Hence the density here
 * relative to the size of the functions.
 */

const line = (over: Partial<DiffLine> = {}): DiffLine => ({
  kind: 'ctx',
  oldNo: 1,
  newNo: 1,
  text: 'const x = 1;',
  ranges: [],
  noNewline: false,
  ...over,
});

const diff = (hunks: { newStart: number; lines: DiffLine[] }[]): FileDiff => ({
  path: 'src/app.tsx',
  oldPath: null,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: hunks.map((hunk) => ({
    oldStart: hunk.newStart,
    oldLines: hunk.lines.length,
    newStart: hunk.newStart,
    newLines: hunk.lines.length,
    heading: '',
    lines: hunk.lines,
  })),
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const thread = (over: Partial<ForgeReviewThread> = {}): ForgeReviewThread => ({
  id: 'PRRT_1',
  path: 'src/app.tsx',
  line: 10,
  originalLine: 10,
  startLine: null,
  side: 'RIGHT',
  resolved: false,
  outdated: false,
  fileLevel: false,
  comments: [],
  ...over,
});

describe('isAnchored', () => {
  it('accepts a live right-side thread', () => {
    expect(isAnchored(thread())).toBe(true);
  });

  it.each([
    ['outdated', { outdated: true }],
    ['file-level', { fileLevel: true }],
    ['line-less', { line: null }],
  ])('rejects a %s thread', (_label, over) => {
    expect(isAnchored(thread(over))).toBe(false);
  });

  it('accepts a live left-side thread', () => {
    expect(isAnchored(thread({ side: 'LEFT' }))).toBe(true);
  });


  it('rejects an outdated thread even when a line came back anyway', () => {
    // The combination exists, and `line` is the field that must not be trusted:
    // GitHub sets `isOutdated` on a thread whose anchor moved, and the number
    // it reports then describes a version of the file nobody is looking at.
    expect(isAnchored(thread({ outdated: true, line: 10 }))).toBe(false);
  });
});

describe('rightSideLines', () => {
  it('collects the new-file numbers of added and context lines', () => {
    const lines = rightSideLines(
      diff([{ newStart: 10, lines: [line({ newNo: 10 }), line({ kind: 'add', newNo: 11 })] }]),
    );

    expect([...lines].sort((a, b) => a - b)).toEqual([10, 11]);
  });

  it('omits deleted lines, which have no right side to anchor to', () => {
    const lines = rightSideLines(
      diff([
        { newStart: 10, lines: [line({ kind: 'del', oldNo: 10, newNo: null }), line({ newNo: 10 })] },
      ]),
    );

    expect([...lines]).toEqual([10]);
  });

  it('leaves the gap between two hunks out, rather than filling the range', () => {
    /*
      The reason this is a Set and not a min/max test: a thread on line 50 of a
      file whose diff renders 10-12 and 90-92 must not be treated as renderable
      just because 50 falls between the two.
    */
    const lines = rightSideLines(
      diff([
        { newStart: 10, lines: [line({ newNo: 10 })] },
        { newStart: 90, lines: [line({ newNo: 90 })] },
      ]),
    );

    expect(lines.has(50)).toBe(false);
    expect(lines.has(10)).toBe(true);
    expect(lines.has(90)).toBe(true);
  });
});

describe('threadsForFile', () => {
  it('keys anchored threads by their current line', () => {
    const { byLine } = threadsForFile([thread({ line: 4 }), thread({ id: 'b', line: 9 })], 'src/app.tsx');

    expect([...byLine.keys()]).toEqual([4, 9]);
  });

  it('groups several threads on one line rather than keeping only the last', () => {
    const { byLine } = threadsForFile(
      [thread({ id: 'a', line: 4 }), thread({ id: 'b', line: 4 })],
      'src/app.tsx',
    );

    expect(byLine.get(4)?.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('ignores threads belonging to another file', () => {
    const { byLine, unanchored } = threadsForFile(
      [thread({ path: 'src/other.tsx' })],
      'src/app.tsx',
    );

    expect(byLine.size).toBe(0);
    expect(unanchored).toEqual([]);
  });

  it('routes every unanchorable thread to the second group, never to a line', () => {
    const { byLine, leftByLine, unanchored } = threadsForFile(
      [
        thread({ id: 'outdated', outdated: true, line: null, originalLine: 40 }),
        thread({ id: 'file', fileLevel: true, line: null }),
        thread({ id: 'left', side: 'LEFT', line: 10 }),
      ],
      'src/app.tsx',
    );

    expect(byLine.size).toBe(0);
    expect(leftByLine.get(10)?.map((t) => t.id)).toEqual(['left']);
    expect(unanchored.map((t) => t.id)).toEqual(['outdated', 'file']);
  });

  /*
    ─── The anchor a diff does not contain ────────────────────────────────────

    The one gap `isAnchored` cannot see. A reviewer who expands context on
    github.com can comment far outside any hunk, and the thread comes back live,
    right-side and unresolved with a perfectly real `line`. Keyed into `byLine`
    it matches no row and renders nowhere — a review comment silently missing.
  */
  it('sends a live thread outside every hunk to unanchored, not to byLine', () => {
    const rendered = diff([{ newStart: 10, lines: [line({ newNo: 10 })] }]);

    const { byLine, unanchored } = threadsForFile(
      [thread({ id: 'expanded', line: 400, originalLine: 400 })],
      'src/app.tsx',
      rendered,
    );

    expect(byLine.size).toBe(0);
    expect(unanchored.map((t) => t.id)).toEqual(['expanded']);
  });

  it('keeps a thread whose line the diff does render', () => {
    const rendered = diff([
      { newStart: 10, lines: [line({ newNo: 10 }), line({ kind: 'add', newNo: 11 })] },
    ]);

    const { byLine, unanchored } = threadsForFile(
      [thread({ line: 11, originalLine: 11 })],
      'src/app.tsx',
      rendered,
    );

    expect([...byLine.keys()]).toEqual([11]);
    expect(unanchored).toEqual([]);
  });

  it('does not treat a thread in the gap between two hunks as renderable', () => {
    const rendered = diff([
      { newStart: 10, lines: [line({ newNo: 10 })] },
      { newStart: 90, lines: [line({ newNo: 90 })] },
    ]);

    const { byLine, unanchored } = threadsForFile(
      [thread({ id: 'between', line: 50, originalLine: 50 })],
      'src/app.tsx',
      rendered,
    );

    expect(byLine.size).toBe(0);
    expect(unanchored.map((t) => t.id)).toEqual(['between']);
  });

  it('skips the check entirely when no diff was given', () => {
    // The pre-diff caller: grouping is still useful before the patch arrives,
    // and there is no set to check against yet.
    const { byLine } = threadsForFile([thread({ line: 400 })], 'src/app.tsx');

    expect([...byLine.keys()]).toEqual([400]);
  });
});

describe('positionForLine', () => {
  /*
    GitHub's definition: "the number of lines down from the first `@@` hunk
    header", where the line immediately below that header is 1. Every case below
    is one clause of that sentence.
  */

  it('counts the first line below the first header as 1', () => {
    const file = diff([{ newStart: 1, lines: [line({ newNo: 1 }), line({ newNo: 2 })] }]);

    expect(positionForLine(file, 1)).toBe(1);
    expect(positionForLine(file, 2)).toBe(2);
  });

  it('counts deleted lines, which have no new-file number of their own', () => {
    // Position is an offset into the PATCH, not into the new file — so a `-`
    // line advances it. Skipping them is the classic off-by-n here.
    const file = diff([
      {
        newStart: 1,
        lines: [
          line({ newNo: 1 }),
          line({ kind: 'del', newNo: null, oldNo: 2 }),
          line({ kind: 'add', newNo: 2, oldNo: null }),
        ],
      },
    ]);

    expect(positionForLine(file, 2)).toBe(3);
  });

  it('counts each hunk header after the first as a line of its own', () => {
    const file = diff([
      { newStart: 1, lines: [line({ newNo: 1 }), line({ newNo: 2 })] },
      { newStart: 40, lines: [line({ newNo: 40 }), line({ newNo: 41 })] },
    ]);

    // 2 lines, then the second `@@` (3), then its first line (4).
    expect(positionForLine(file, 40)).toBe(4);
    expect(positionForLine(file, 41)).toBe(5);
  });

  it('answers null for a line outside every hunk', () => {
    // A line the diff does not contain has no position. Inventing one would
    // anchor the comment to whatever text happens to sit at that offset.
    const file = diff([{ newStart: 1, lines: [line({ newNo: 1 })] }]);

    expect(positionForLine(file, 99)).toBeNull();
  });

  it('answers null for a diff with no hunks at all', () => {
    expect(positionForLine(diff([]), 1)).toBeNull();
  });

  it('never returns the position of a deleted line that shares the number', () => {
    // A `-` line can carry an `oldNo` equal to the `newNo` being asked for.
    // Matching on it would anchor a right-side comment to a left-side row.
    const file = diff([
      {
        newStart: 1,
        lines: [
          line({ kind: 'del', newNo: null, oldNo: 5 }),
          line({ kind: 'add', newNo: 5, oldNo: null }),
        ],
      },
    ]);

    expect(positionForLine(file, 5)).toBe(2);
  });
});

describe('isCommentableLine', () => {
  it('accepts added and context lines on right side', () => {
    expect(isCommentableLine({ kind: 'add', oldNo: null, newNo: 3 }, 'right')).toBe(true);
    expect(isCommentableLine({ kind: 'ctx', oldNo: 3, newNo: 3 }, 'right')).toBe(true);
  });

  it('accepts deleted lines on left side', () => {
    expect(isCommentableLine({ kind: 'del', oldNo: 3, newNo: null }, 'left')).toBe(true);
  });

  it('refuses deleted lines on right side', () => {
    expect(isCommentableLine({ kind: 'del', oldNo: 3, newNo: null }, 'right')).toBe(false);
  });

  it('refuses added lines on left side', () => {
    expect(isCommentableLine({ kind: 'add', oldNo: null, newNo: 3 }, 'left')).toBe(false);
  });
});

