import { describe, expect, it } from 'vitest';

import { buildChurn } from './churn';
import type { FileChange, HistoryCommit } from './commit-history';

const commit = (at: number, files: FileChange[]): HistoryCommit => ({
  sha: `${at}`,
  at,
  authorName: 'A',
  authorEmail: 'a@example.com',
  subject: 's',
  files,
});

const file = (path: string, insertions = 1, deletions = 0): FileChange => ({
  path,
  insertions,
  deletions,
});

describe('buildChurn', () => {
  it('is empty when nothing was measured', () => {
    expect(buildChurn([])).toEqual({ files: [], withheld: 0 });
  });

  it('ignores commits carrying no file data', () => {
    const bare: HistoryCommit = {
      sha: 'x',
      at: 1,
      authorName: 'A',
      authorEmail: 'a@example.com',
      subject: 's',
    };
    expect(buildChurn([bare]).files).toEqual([]);
  });

  it('ranks by how many commits touched a file, not by lines changed', () => {
    // A lockfile rewritten once in a 90,000-line diff would top any line-based
    // ranking while telling you nothing; the file thirty commits had to touch
    // is where the work actually is.
    const commits = [
      commit(1, [file('pnpm-lock.yaml', 90_000, 90_000)]),
      commit(2, [file('src/app.ts', 3, 1)]),
      commit(3, [file('src/app.ts', 2, 2)]),
    ];
    expect(buildChurn(commits).files[0]!.path).toBe('src/app.ts');
  });

  it('sums lines alongside the commit count', () => {
    const commits = [commit(1, [file('a.ts', 10, 2)]), commit(2, [file('a.ts', 5, 3)])];
    expect(buildChurn(commits).files[0]).toEqual({
      path: 'a.ts',
      insertions: 15,
      deletions: 5,
      commits: 2,
    });
  });

  it('counts a binary file as zero lines but still as a touch', () => {
    const commits = [commit(1, [{ path: 'logo.png', insertions: null, deletions: null }])];
    expect(buildChurn(commits).files[0]).toEqual({
      path: 'logo.png',
      insertions: 0,
      deletions: 0,
      commits: 1,
    });
  });

  it('caps the table and says what it withheld', () => {
    // A cap you cannot see reads as "these are all the files that changed".
    const commits = Array.from({ length: 30 }, (_, i) => commit(i, [file(`f${i}.ts`)]));
    const churn = buildChurn(commits, 5);
    expect(churn.files).toHaveLength(5);
    expect(churn.withheld).toBe(25);
  });

  it('reports nothing withheld when everything fits', () => {
    expect(buildChurn([commit(1, [file('a.ts')])], 5).withheld).toBe(0);
  });

  it('orders two otherwise-identical files stably, so the table does not reshuffle', () => {
    const commits = [commit(1, [file('b.ts', 1, 1), file('a.ts', 1, 1)])];
    expect(buildChurn(commits).files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
  });
});
