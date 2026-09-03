import { describe, expect, it } from 'vitest';

import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';

import {
  checkSuggestionApplies,
  extractSuggestion,
  spliceSuggestion,
  suggestionLineRange,
} from './suggestion-block';

function thread(overrides: Partial<ForgeReviewThread> = {}): ForgeReviewThread {
  return {
    id: 't1',
    path: 'src/example.ts',
    line: 12,
    originalLine: 12,
    startLine: null,
    side: 'RIGHT',
    resolved: false,
    outdated: false,
    fileLevel: false,
    comments: [],
    ...overrides,
  };
}

function fileDiff(lines: Array<{ newNo: number; text: string; kind?: 'add' | 'ctx' }>): FileDiff {
  return {
    path: 'src/example.ts',
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    insertions: 0,
    deletions: 0,
    contextLines: 3,
    combined: false,
    truncated: false,
    droppedLines: 0,
    hunks: [
      {
        oldStart: 1,
        oldLines: lines.length,
        newStart: lines[0]?.newNo ?? 1,
        newLines: lines.length,
        heading: '',
        lines: lines.map((l) => ({
          kind: l.kind ?? 'ctx',
          oldNo: null,
          newNo: l.newNo,
          text: l.text,
          ranges: [],
          noNewline: false,
        })),
      },
    ],
  };
}

describe('extractSuggestion', () => {
  it('extracts a single suggestion fence on its own', () => {
    const body = '```suggestion\nconst x = 2;\n```';
    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('extracts a suggestion fence wrapped in prose before and after', () => {
    const body = [
      'please fix the typo:',
      '',
      '```suggestion',
      'const x = 2;',
      '```',
      '',
      'thanks!',
    ].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('returns null when no suggestion fence is present', () => {
    expect(extractSuggestion('just a comment, no code at all')).toBeNull();
    expect(extractSuggestion('```ts\nconst x = 2;\n```')).toBeNull();
  });

  it('uses the first of two separate suggestion fences, not the last', () => {
    const body = [
      '```suggestion',
      'const first = 1;',
      '```',
      '',
      'and also:',
      '',
      '```suggestion',
      'const second = 2;',
      '```',
    ].join('\n');

    expect(extractSuggestion(body)).toBe('const first = 1;');
  });

  it('finds a suggestion fence nested inside a blockquote', () => {
    const body = ['> please apply:', '>', '> ```suggestion', '> const x = 2;', '> ```'].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('finds a suggestion fence nested inside a list item', () => {
    const body = ['- fix this:', '  ```suggestion', '  const x = 2;', '  ```'].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('preserves multi-line replacement content exactly, including blank lines', () => {
    const body = '```suggestion\nline one\n\nline three\n```';
    expect(extractSuggestion(body)).toBe('line one\n\nline three');
  });

  it('treats any fence tagged `suggestion` as real, even a nonsense one', () => {
    // GitHub itself makes the same simplification — this phase does not try
    // to be stricter than the platform whose syntax it is reading.
    const body = '```suggestion\n¯\\_(ツ)_/¯\n```';
    expect(extractSuggestion(body)).toBe('¯\\_(ツ)_/¯');
  });
});

describe('suggestionLineRange', () => {
  it('a single-line thread (no startLine) ranges over just that line', () => {
    expect(suggestionLineRange(thread({ line: 12, startLine: null }))).toEqual({
      start: 12,
      end: 12,
    });
  });

  it('a multi-line thread ranges from startLine through line', () => {
    expect(suggestionLineRange(thread({ line: 14, startLine: 10 }))).toEqual({
      start: 10,
      end: 14,
    });
  });

  it('a LEFT-side thread is not applicable, regardless of its suggestion fence', () => {
    expect(suggestionLineRange(thread({ side: 'LEFT', line: 12 }))).toBeNull();
  });

  it('a thread with no current line (outdated) is not applicable', () => {
    expect(suggestionLineRange(thread({ line: null }))).toBeNull();
  });
});

describe('checkSuggestionApplies', () => {
  const file = fileDiff([
    { newNo: 11, text: 'function greet() {', kind: 'ctx' },
    { newNo: 12, text: "  console.log('hi');", kind: 'add' },
    { newNo: 13, text: '}', kind: 'ctx' },
  ]);
  // Padded so the local file's own line numbers (1-indexed) line up with the
  // diff fixture's `newNo`s (11-13) — a real checkout's lines 1-10 stand in
  // for whatever precedes this function.
  const preamble = Array.from({ length: 10 }, (_, i) => `// line ${i + 1}`);
  const matchingContent = [...preamble, 'function greet() {', "  console.log('hi');", '}'].join(
    '\n',
  );
  const divergedContent = [...preamble, 'function greet() {', "  console.log('bye');", '}'].join(
    '\n',
  );

  it('an exact match between the diff and the local file is applicable', () => {
    expect(
      checkSuggestionApplies({ thread: thread(), file, localContent: matchingContent }),
    ).toEqual({ ok: true });
  });

  it('a local edit at the target line disables Apply with the divergence reason', () => {
    expect(
      checkSuggestionApplies({ thread: thread(), file, localContent: divergedContent }),
    ).toEqual({
      ok: false,
      reason: 'this file has changed since the suggestion was written',
    });
  });

  it('a deleted local file disables Apply', () => {
    expect(checkSuggestionApplies({ thread: thread(), file, localContent: null })).toEqual({
      ok: false,
      reason: 'the file no longer exists locally',
    });
  });

  it('an outdated thread disables Apply regardless of content match', () => {
    expect(
      checkSuggestionApplies({
        thread: thread({ outdated: true }),
        file,
        localContent: matchingContent,
      }),
    ).toEqual({ ok: false, reason: 'this thread is no longer part of the diff' });
  });

  it('a LEFT-side thread is disabled as not applicable', () => {
    expect(
      checkSuggestionApplies({
        thread: thread({ side: 'LEFT' }),
        file,
        localContent: matchingContent,
      }),
    ).toEqual({ ok: false, reason: 'not applicable to this thread' });
  });

  it('a range the diff cannot fully verify (a gap) fails closed', () => {
    const localContent = ['function greet() {', "  console.log('hi');", '}'].join('\n');
    // line 12 is the only one the fixture's hunk actually carries as add/ctx —
    // asking about a range past it hits the gap path.
    expect(
      checkSuggestionApplies({
        thread: thread({ line: 20, startLine: 19 }),
        file,
        localContent,
      }),
    ).toEqual({ ok: false, reason: 'this file has changed since the suggestion was written' });
  });
});

describe('spliceSuggestion', () => {
  it('replaces a single line in place', () => {
    const content = ['a', 'b', 'c'].join('\n');
    expect(spliceSuggestion(content, { start: 2, end: 2 }, 'B')).toBe(['a', 'B', 'c'].join('\n'));
  });

  it('replaces a multi-line range with a differently-sized suggestion', () => {
    const content = ['a', 'b', 'c', 'd'].join('\n');
    expect(spliceSuggestion(content, { start: 2, end: 3 }, 'x\ny\nz')).toBe(
      ['a', 'x', 'y', 'z', 'd'].join('\n'),
    );
  });

  it('keeps CRLF line endings on every untouched line, not just the spliced range', () => {
    const content = ['a', 'b', 'c'].join('\r\n');
    expect(spliceSuggestion(content, { start: 2, end: 2 }, 'B')).toBe(['a', 'B', 'c'].join('\r\n'));
  });
});
