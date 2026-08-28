import { describe, expect, it } from 'vitest';

import { parseGrep } from './grep-parser';

describe('parseGrep', () => {
  it('parses one match per record', () => {
    const payload = 'a.txt\x001\x00foo\na.txt\x003\x00foo again\n';
    expect(parseGrep(payload)).toEqual([
      { path: 'a.txt', line: 1, text: 'foo' },
      { path: 'a.txt', line: 3, text: 'foo again' },
    ]);
  });

  it('preserves a NUL-free but colon-bearing text field untouched', () => {
    const payload = 'src/log.ts\x0042\x00  time: 12:00, level: info\n';
    expect(parseGrep(payload)).toEqual([
      { path: 'src/log.ts', line: 42, text: '  time: 12:00, level: info' },
    ]);
  });

  it('returns an empty array for empty payload (no matches)', () => {
    expect(parseGrep('')).toEqual([]);
  });

  it('skips a malformed record rather than throwing', () => {
    const payload = 'no-nuls-at-all\na.txt\x001\x00ok\n';
    expect(parseGrep(payload)).toEqual([{ path: 'a.txt', line: 1, text: 'ok' }]);
  });

  it('handles a path itself containing NUL-adjacent-looking content safely', () => {
    // A match whose text happens to start with digits followed by a colon
    // must not be confused with the line-number field — the split is
    // positional (first two NULs), not pattern-based.
    const payload = 'a.txt\x005\x0042: the answer\n';
    expect(parseGrep(payload)).toEqual([{ path: 'a.txt', line: 5, text: '42: the answer' }]);
  });
});
