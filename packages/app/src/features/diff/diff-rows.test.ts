import type { DiffLine, FileDiff, ForgeReviewThread } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import type { ThreadsByLine } from './comment-anchors';
import {
  mergeSegmentsWithTokens,
  toDiffRows,
  toSegments,
  withCommentRows,
  type DiffRow,
} from './diff-rows';

const line = (over: Partial<DiffLine> = {}): DiffLine => ({
  kind: 'ctx',
  oldNo: 1,
  newNo: 1,
  text: 'text',
  ranges: [],
  noNewline: false,
  ...over,
});

const diff = (hunks: FileDiff['hunks']): FileDiff => ({
  path: 'a.ts',
  oldPath: 'a.ts',
  change: 'modified',
  binary: false,
  combined: false,
  oldMode: null,
  newMode: null,
  hunks,
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  truncated: false,
  droppedLines: 0,
});

describe('toDiffRows', () => {
  it('emits a header row before each hunk and one row per line', () => {
    const rows = toDiffRows(
      diff([
        { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, heading: 'fn a', lines: [line(), line()] },
      ]),
    );

    expect(rows.map((r) => r.kind)).toEqual(['hunk', 'line', 'line']);
    expect(rows[0]).toMatchObject({ kind: 'hunk', heading: 'fn a' });
  });

  it('reports the gap between hunks, and none before the first', () => {
    const rows = toDiffRows(
      diff([
        { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, heading: '', lines: [line()] },
        { oldStart: 40, oldLines: 2, newStart: 40, newLines: 2, heading: '', lines: [line()] },
      ]),
    );

    const headers = rows.filter((r) => r.kind === 'hunk');
    // The first hunk has no preceding hunk to measure a gap from.
    expect(headers[0]).toMatchObject({ gap: null });
    // First hunk covers new lines 1..3; the second starts at 40.
    expect(headers[1]).toMatchObject({ gap: 37 });
  });

  it('produces no rows for a diff with no hunks', () => {
    expect(toDiffRows(diff([]))).toEqual([]);
  });
});

describe('toSegments', () => {
  const render = (segments: ReturnType<typeof toSegments>) => segments.map((s) => s.text).join('');

  it('returns one unchanged segment when there are no ranges', () => {
    expect(toSegments(line({ text: 'hello' }))).toEqual([{ text: 'hello', changed: false }]);
  });

  it('splits around a range in the middle', () => {
    const segments = toSegments(line({ text: 'const a = 1;', ranges: [{ start: 10, end: 11 }] }));
    expect(segments).toEqual([
      { text: 'const a = ', changed: false },
      { text: '1', changed: true },
      { text: ';', changed: false },
    ]);
  });

  it('handles a range at the very start and the very end', () => {
    expect(toSegments(line({ text: 'abc', ranges: [{ start: 0, end: 1 }] }))[0]).toEqual({
      text: 'a',
      changed: true,
    });
    expect(toSegments(line({ text: 'abc', ranges: [{ start: 2, end: 3 }] })).at(-1)).toEqual({
      text: 'c',
      changed: true,
    });
  });

  it('never loses or duplicates a character, whatever the ranges', () => {
    // The worst failure this component has available is silently rendering
    // source text that is not what git reported.
    const text = 'const timeout = 1500;';
    for (const ranges of [
      [{ start: 0, end: 5 }],
      [
        { start: 0, end: 5 },
        { start: 6, end: 13 },
      ],
      // Deliberately out of order, overlapping, and out of bounds.
      [
        { start: 6, end: 13 },
        { start: 0, end: 5 },
      ],
      [
        { start: 0, end: 8 },
        { start: 4, end: 12 },
      ],
      [{ start: 5, end: 999 }],
      [{ start: -3, end: 4 }],
      [{ start: 7, end: 7 }],
    ]) {
      expect(render(toSegments(line({ text, ranges })))).toBe(text);
    }
  });

  it('merges overlapping ranges rather than emitting the overlap twice', () => {
    const segments = toSegments(
      line({
        text: 'abcdef',
        ranges: [
          { start: 0, end: 4 },
          { start: 2, end: 6 },
        ],
      }),
    );
    expect(render(segments)).toBe('abcdef');
    expect(segments.every((s) => s.changed)).toBe(true);
  });
});

describe('mergeSegmentsWithTokens', () => {
  const render = (pieces: ReturnType<typeof mergeSegmentsWithTokens>) =>
    pieces.map((p) => p.text).join('');

  it('keeps the segments unchanged, with no colour, when tokens are null', () => {
    const segments = toSegments(line({ text: 'const a = 1;', ranges: [{ start: 10, end: 11 }] }));
    expect(mergeSegmentsWithTokens(segments, null)).toEqual([
      { text: 'const a = ', changed: false, color: null },
      { text: '1', changed: true, color: null },
      { text: ';', changed: false, color: null },
    ]);
  });

  it('cuts at token boundaries that fall inside a segment', () => {
    // One unchanged segment, two tokens splitting it in the middle.
    const segments = toSegments(line({ text: 'const a' }));
    const tokens = [
      { text: 'const', color: '#ff0000' },
      { text: ' a', color: '#00ff00' },
    ];
    expect(mergeSegmentsWithTokens(segments, tokens)).toEqual([
      { text: 'const', changed: false, color: '#ff0000' },
      { text: ' a', changed: false, color: '#00ff00' },
    ]);
  });

  it('cuts at segment boundaries that fall inside a token', () => {
    // One token spanning the whole line, one changed sub-range in the middle.
    const segments = toSegments(line({ text: 'const a = 1;', ranges: [{ start: 10, end: 11 }] }));
    const tokens = [{ text: 'const a = 1;', color: '#abcdef' }];
    const pieces = mergeSegmentsWithTokens(segments, tokens);
    expect(render(pieces)).toBe('const a = 1;');
    expect(pieces.every((p) => p.color === '#abcdef')).toBe(true);
    expect(pieces.find((p) => p.text === '1')?.changed).toBe(true);
  });

  it('never loses or duplicates a character when the two partitions disagree everywhere', () => {
    const text = 'const timeout = 1500;';
    const segments = toSegments(
      line({ text, ranges: [{ start: 6, end: 13 }, { start: 16, end: 20 }] }),
    );
    const tokens = [
      { text: 'const', color: '#1' },
      { text: ' timeout', color: '#2' },
      { text: ' = ', color: null },
      { text: '1500', color: '#3' },
      { text: ';', color: null },
    ];
    const pieces = mergeSegmentsWithTokens(segments, tokens);
    expect(render(pieces)).toBe(text);
  });
});

describe('withCommentRows', () => {
  const thread = (id: string): ForgeReviewThread => ({
    id,
    path: 'a.ts',
    line: 2,
    originalLine: 2,
    startLine: null,
    side: 'RIGHT',
    resolved: false,
    outdated: false,
    fileLevel: false,
    comments: [],
  });

  const rows: DiffRow[] = toDiffRows(
    diff([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        heading: '',
        lines: [
          line({ newNo: 1 }),
          line({ newNo: 2 }),
          line({ kind: 'del', newNo: null, oldNo: 3 }),
        ],
      },
    ]),
  );

  const byLine = (entries: [number, ForgeReviewThread[]][]): ThreadsByLine => new Map(entries);

  it('returns the very same array when there is nothing to splice', () => {
    // Identity, not equality: the Changes page and the commit inspector pass
    // neither prop, and they must not pay a copy of a 4000-row list per render.
    expect(withCommentRows(rows, undefined, null)).toBe(rows);
    expect(withCommentRows(rows, new Map(), null)).toBe(rows);
  });

  it('puts a thread row directly after the line it hangs off', () => {
    const out = withCommentRows(rows, byLine([[2, [thread('a')]]]), null);

    // hunk, line 1, line 2, THREAD, deleted line.
    expect(out.map((row) => row.kind)).toEqual(['hunk', 'line', 'line', 'thread', 'line']);
    expect(out[3]).toMatchObject({ kind: 'thread', line: 2 });
  });

  it('puts the composer after any thread already on that line', () => {
    const out = withCommentRows(rows, byLine([[2, [thread('a')]]]), 2);

    expect(out.map((row) => row.kind)).toEqual([
      'hunk',
      'line',
      'line',
      'thread',
      'composer',
      'line',
    ]);
  });

  it('renders a composer on a line with no threads at all', () => {
    const out = withCommentRows(rows, undefined, 1);

    expect(out.map((row) => row.kind)).toEqual(['hunk', 'line', 'composer', 'line', 'line']);
  });

  it('carries every thread on a line into the one row', () => {
    const out = withCommentRows(rows, byLine([[2, [thread('a'), thread('b')]]]), null);
    const spliced = out.find((row) => row.kind === 'thread');

    expect(spliced?.kind === 'thread' ? spliced.threads.map((t) => t.id) : []).toEqual(['a', 'b']);
  });

  it('never anchors to a deleted line, even when one is asked for', () => {
    // A `del` row has no `newNo`, so it can carry neither a thread nor a
    // composer — v1 writes only the right side.
    const out = withCommentRows(rows, byLine([[3, [thread('a')]]]), 3);

    expect(out.map((row) => row.kind)).toEqual(['hunk', 'line', 'line', 'line']);
  });

  it('ignores a thread whose line is not in the diff', () => {
    const out = withCommentRows(rows, byLine([[99, [thread('a')]]]), null);

    expect(out).toHaveLength(rows.length);
  });
});
