import { describe, expect, it } from 'vitest';

import { parseCommitNumstat } from './numstat-parser';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const P = 'c'.repeat(40);
const Q = 'd'.repeat(40);

const record = (sha: string, parents: string, entries: string[]) =>
  `\x01${sha}\0${parents}\0${entries.map((e) => `${e}\0`).join('')}`;

describe('parseCommitNumstat', () => {
  it('sums added, deleted and files per commit', () => {
    const out = parseCommitNumstat(
      record(A, P, ['3\t1\tsrc/a.ts', '10\t0\tsrc/b.ts']) + record(B, A, ['0\t7\tc.ts']),
    );
    expect(out.get(A)).toEqual({ added: 13, deleted: 1, files: 2 });
    expect(out.get(B)).toEqual({ added: 0, deleted: 7, files: 1 });
  });

  it('counts binary files as changed files with no lines', () => {
    expect(parseCommitNumstat(record(A, P, ['-\t-\timg.png', '2\t2\tx.ts'])).get(A)).toEqual({
      added: 2,
      deleted: 2,
      files: 2,
    });
  });

  it('reports merge commits (two parents) as null', () => {
    expect(parseCommitNumstat(record(A, `${P} ${Q}`, [])).get(A)).toBeNull();
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
