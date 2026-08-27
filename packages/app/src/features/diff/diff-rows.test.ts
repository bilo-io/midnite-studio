import type { DiffLine, FileDiff } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { mergeSegmentsWithTokens, toDiffRows, toSegments } from './diff-rows';

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
