import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { excerptFromFile, excerptFromHunk, parseDiffHunk, threadExcerpt } from './diff-hunk';

const HUNK = [
  '@@ -10,5 +10,6 @@ function greet() {',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' return a;',
  ' }',
].join('\n');

const ANCHOR = { line: 15, originalLine: 15, startLine: null, side: 'RIGHT' as const };

describe('parseDiffHunk', () => {
  it('numbers old and new lines from the header', () => {
    const parsed = parseDiffHunk(HUNK)!;
    expect(parsed.header).toBe('@@ -10,5 +10,6 @@ function greet() {');
    expect(parsed.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['ctx', 10, 10],
      ['del', 11, null],
      ['add', null, 11],
      ['add', null, 12],
      ['ctx', 12, 13],
      ['ctx', 13, 14],
    ]);
  });

  it('returns null with no header or empty input', () => {
    expect(parseDiffHunk('')).toBeNull();
    expect(parseDiffHunk('just text')).toBeNull();
  });

  it('skips "No newline" markers and a trailing newline', () => {
    const parsed = parseDiffHunk('@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n')!;
    expect(parsed.lines.map((l) => l.text)).toEqual(['a', 'b']);
  });
});

describe('excerptFromHunk', () => {
  it('keeps the last four lines and marks only the final one commented', () => {
    const excerpt = excerptFromHunk(HUNK, ANCHOR)!;
    expect(excerpt.lines.map((l) => l.text)).toEqual(['const b = 3;', 'const c = 4;', 'return a;', '}']);
    expect(excerpt.lines.map((l) => l.commented)).toEqual([false, false, false, true]);
  });

  it('runs from startLine for a multi-line thread and marks the whole range', () => {
    const excerpt = excerptFromHunk(HUNK, { ...ANCHOR, startLine: 11 })!;
    expect(excerpt.lines.map((l) => l.newNo)).toEqual([11, 12, 13, 14]);
    expect(excerpt.lines.every((l) => l.commented)).toBe(true);
  });

  it('returns the whole hunk when it is shorter than the limit', () => {
    expect(excerptFromHunk('@@ -1 +1 @@\n+x', ANCHOR)!.lines).toHaveLength(1);
  });
});

function fileDiff(): FileDiff {
  const line = (kind: 'add' | 'del' | 'ctx', oldNo: number | null, newNo: number | null, text: string) => ({
    kind,
    oldNo,
    newNo,
    text,
    ranges: [],
    noNewline: false,
  });
  return {
    path: 'a.ts',
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    insertions: 1,
    deletions: 0,
    contextLines: 3,
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 4,
        heading: '',
        lines: [line('ctx', 1, 1, 'one'), line('ctx', 2, 2, 'two'), line('add', null, 3, 'three'), line('ctx', 3, 4, 'four')],
      },
    ],
  } as FileDiff;
}

describe('excerptFromFile', () => {
  it('cuts lines ending at the thread line', () => {
    const excerpt = excerptFromFile(fileDiff(), { ...ANCHOR, line: 3 })!;
    expect(excerpt.lines.map((l) => l.text)).toEqual(['one', 'two', 'three']);
    expect(excerpt.lines.at(-1)!.commented).toBe(true);
  });

  it('is null when the line is not in the patch', () => {
    expect(excerptFromFile(fileDiff(), { ...ANCHOR, line: 99 })).toBeNull();
  });
});

describe('threadExcerpt', () => {
  const thread = (diffHunk: string): ForgeReviewThread =>
    ({
      id: 't',
      path: 'a.ts',
      line: 3,
      originalLine: 3,
      startLine: null,
      side: 'RIGHT',
      resolved: false,
      outdated: false,
      fileLevel: false,
      comments: [{ id: 'c', databaseId: '1', author: 'x', body: '', createdAt: '', url: '', diffHunk, reviewId: null }],
    }) as ForgeReviewThread;

  it('prefers the diffHunk, falls back to the file, else null', () => {
    expect(threadExcerpt(thread(HUNK))!.header).toContain('@@');
    expect(threadExcerpt(thread(''), fileDiff())!.lines).toHaveLength(3);
    expect(threadExcerpt(thread(''))).toBeNull();
  });
});
