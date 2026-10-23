import { describe, expect, it } from 'vitest';

import { parseCommitNumstat, parseNumstat, sumNumstat } from './numstat-parser';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const P = 'c'.repeat(40);
const Q = 'd'.repeat(40);

/**
 * One record the way `git log -z --format=%x01%H%x00%P%x00 --numstat` really
 * prints it: a NUL closes the header, then a NEWLINE before the first entry.
 * Hand-built records without that newline are what let the first-file bug
 * through, so every record here carries it.
 */
const record = (sha: string, parents: string, entries: string[]) =>
  `\x01${sha}\0${parents}\0\0${entries.length > 0 ? '\n' : ''}${entries.map((e) => `${e}\0`).join('')}`;

describe('parseCommitNumstat', () => {
  it('sums added, deleted and files per commit, the first file included', () => {
    const out = parseCommitNumstat(
      record(A, P, ['3\t1\tsrc/a.ts', '10\t0\tsrc/b.ts']) + record(B, A, ['0\t7\tc.ts']),
    );
    expect(out.get(A)).toEqual({ added: 13, deleted: 1, files: 2 });
    expect(out.get(B)).toEqual({ added: 0, deleted: 7, files: 1 });
  });

  it('counts a one-file commit — the newline-led first entry — rather than +0 −0', () => {
    expect(parseCommitNumstat(record(A, P, ['1\t1\t.midnite/tasks/_INDEX.md'])).get(A)).toEqual({
      added: 1,
      deleted: 1,
      files: 1,
    });
  });

  it('counts binary files as changed files with no lines', () => {
    expect(parseCommitNumstat(record(A, P, ['-\t-\timg.png', '2\t2\tx.ts'])).get(A)).toEqual({
      added: 2,
      deleted: 2,
      files: 2,
    });
  });

  it('counts a rename once, from its two extra NUL fields', () => {
    // `<ins>\t<del>\t` then `<from>\0<to>`: the from/to tokens are not entries.
    expect(parseCommitNumstat(record(A, P, ['2\t1\t', 'old.ts', 'new.ts', '4\t0\tother.ts'])).get(A)).toEqual({
      added: 6,
      deleted: 1,
      files: 2,
    });
  });

  it('gives a merge (two parents) the stat of the entries git printed for its first parent', () => {
    expect(parseCommitNumstat(record(A, `${P} ${Q}`, ['5\t2\tside.ts'])).get(A)).toEqual({
      added: 5,
      deleted: 2,
      files: 1,
    });
  });

  it('gives an empty commit zeros, and a root commit (no parents) its stat', () => {
    expect(parseCommitNumstat(record(A, P, [])).get(A)).toEqual({ added: 0, deleted: 0, files: 0 });
    expect(parseCommitNumstat(record(A, '', ['5\t0\tf'])).get(A)).toEqual({ added: 5, deleted: 0, files: 1 });
  });

  it('is NUL-safe for paths with spaces, tabs, newlines and a stray marker byte', () => {
    const out = parseCommitNumstat(record(A, P, ['1\t2\tmy file\twith\ttabs\nand newline', '4\t0\tweird\x01name']));
    expect(out.get(A)).toEqual({ added: 5, deleted: 2, files: 2 });
    expect(out.size).toBe(1);
  });

  it('returns an empty map for empty output', () => {
    expect(parseCommitNumstat('').size).toBe(0);
  });
});

describe('parseNumstat', () => {
  it('keeps a path that holds a tab whole', () => {
    expect(parseNumstat('1\t0\ta\tb.txt\0')).toEqual([
      { path: 'a\tb.txt', oldPath: null, insertions: 1, deletions: 0 },
    ]);
  });

  it('reads a newline-led first entry and a rename', () => {
    expect(parseNumstat('\n3\t1\t\0from.ts\0to.ts\0')).toEqual([
      { path: 'to.ts', oldPath: 'from.ts', insertions: 3, deletions: 1 },
    ]);
  });
});

describe('sumNumstat', () => {
  it('counts every file, binaries included, and sums their lines', () => {
    expect(
      sumNumstat([
        { path: 'a', oldPath: null, insertions: 2, deletions: 1 },
        { path: 'bin', oldPath: null, insertions: 0, deletions: 0 },
      ]),
    ).toEqual({ added: 2, deleted: 1, files: 2 });
  });
});
