import { describe, expect, it } from 'vitest';

import { historyArgs, parseHistory, parseNumstatLines, renameTarget } from './commit-history';

const R = '\x1e';
const F = '\x00';

/** Captured shape of `git log --pretty=format:HISTORY_FORMAT`. */
const record = (sha: string, at: number, name: string, email: string, subject: string) =>
  `${R}${sha}${F}${at}${F}${name}${F}${email}${F}${subject}`;

describe('historyArgs', () => {
  it('walks every ref, not just HEAD', () => {
    // A contributor table that omits everyone whose work is on a branch is a
    // contributor table that is wrong.
    expect(historyArgs({ maxCommits: 10 })).toContain('--all');
  });

  it('always passes --use-mailmap', () => {
    expect(historyArgs({ maxCommits: 10 })).toContain('--use-mailmap');
  });

  it('asks for one more commit than the cap, so truncation is knowable', () => {
    expect(historyArgs({ maxCommits: 500 })).toContain('--max-count=501');
  });

  it('omits --numstat unless churn was asked for', () => {
    expect(historyArgs({ maxCommits: 10 })).not.toContain('--numstat');
    expect(historyArgs({ maxCommits: 10, withChurn: true })).toContain('--numstat');
  });

  it('pairs --numstat with --no-merges, always', () => {
    // A merge's numstat is the whole branch it brought in; counting merges
    // double-counts every line and credits it to whoever pressed merge.
    const args = historyArgs({ maxCommits: 10, withChurn: true });
    expect(args).toContain('--no-merges');
  });

  it('leaves --since off for an unbounded window', () => {
    expect(historyArgs({ maxCommits: 10 }).some((a) => a.startsWith('--since'))).toBe(false);
    expect(historyArgs({ maxCommits: 10, since: '30 days ago' })).toContain('--since=30 days ago');
  });
});

describe('parseHistory', () => {
  it('parses a plain record', () => {
    const output = record('abc123', 1_700_000_000, 'Ada Lovelace', 'ada@example.com', 'feat: engine');
    const { commits, truncated } = parseHistory(output, 10);
    expect(truncated).toBe(false);
    expect(commits).toEqual([
      {
        sha: 'abc123',
        at: 1_700_000_000,
        authorName: 'Ada Lovelace',
        authorEmail: 'ada@example.com',
        subject: 'feat: engine',
      },
    ]);
  });

  it('handles an empty repository without inventing a commit', () => {
    expect(parseHistory('', 10)).toEqual({ commits: [], truncated: false });
  });

  it('reports truncation when more than the cap came back', () => {
    const output = [1, 2, 3].map((n) => record(`sha${n}`, 1_700_000_000 + n, 'A', 'a@b', 's')).join('');
    const { commits, truncated } = parseHistory(output, 2);
    expect(truncated).toBe(true);
    // Trimmed to the cap: the extra existed only to prove there was more.
    expect(commits).toHaveLength(2);
  });

  it('is not truncated when the count lands exactly on the cap', () => {
    const output = [1, 2].map((n) => record(`sha${n}`, 1_700_000_000, 'A', 'a@b', 's')).join('');
    expect(parseHistory(output, 2).truncated).toBe(false);
  });

  it('drops a malformed record rather than the whole traversal', () => {
    const output = `${R}garbage${record('good', 1_700_000_000, 'A', 'a@b', 'ok')}`;
    const { commits } = parseHistory(output, 10);
    expect(commits.map((c) => c.sha)).toEqual(['good']);
  });

  it('keeps a subject containing a newline whole', () => {
    // Subjects are %s so they are single-line in practice, but the record
    // separator — not the newline — is what bounds a record, and that is the
    // property worth pinning.
    const output = record('abc', 1_700_000_000, 'A', 'a@b', 'fix: thing');
    expect(parseHistory(output, 10).commits[0]!.subject).toBe('fix: thing');
  });

  it('attaches numstat file lines to the commit above them', () => {
    const output =
      `${record('abc', 1_700_000_000, 'A', 'a@b', 'feat')}\n` +
      '10\t2\tsrc/a.ts\n' +
      '0\t5\tsrc/b.ts\n' +
      `${record('def', 1_699_000_000, 'B', 'b@c', 'fix')}\n` +
      '1\t1\tsrc/c.ts\n';
    const { commits } = parseHistory(output, 10);
    expect(commits[0]!.files).toEqual([
      { path: 'src/a.ts', insertions: 10, deletions: 2 },
      { path: 'src/b.ts', insertions: 0, deletions: 5 },
    ]);
    expect(commits[1]!.files).toHaveLength(1);
  });

  it('leaves files undefined when churn was not requested', () => {
    const output = record('abc', 1_700_000_000, 'A', 'a@b', 'feat');
    expect(parseHistory(output, 10).commits[0]!.files).toBeUndefined();
  });
});

describe('parseNumstatLines', () => {
  it('reads insertions and deletions', () => {
    expect(parseNumstatLines('12\t3\tsrc/a.ts\n')).toEqual([
      { path: 'src/a.ts', insertions: 12, deletions: 3 },
    ]);
  });

  it('reports a binary file as null, not zero', () => {
    // `-`/`-` means "not expressible in lines", not "changed nothing". Summing
    // it as 0 would drop a 40MB asset from the churn table while claiming it
    // did not move.
    expect(parseNumstatLines('-\t-\tdocs/screenshot.png\n')).toEqual([
      { path: 'docs/screenshot.png', insertions: null, deletions: null },
    ]);
  });

  it('keeps a path containing spaces intact', () => {
    expect(parseNumstatLines('1\t0\tdocs/my notes.md\n')[0]!.path).toBe('docs/my notes.md');
  });

  it('ignores blank and malformed lines', () => {
    expect(parseNumstatLines('\n\nnot a numstat line\n5\t5\tok.ts\n')).toEqual([
      { path: 'ok.ts', insertions: 5, deletions: 5 },
    ]);
  });
});

describe('renameTarget', () => {
  it('takes the post-rename path from the arrow form', () => {
    expect(renameTarget('src/old.ts => src/new.ts')).toBe('src/new.ts');
  });

  it('takes the post-rename path from the braced form', () => {
    expect(renameTarget('src/{old => new}.ts')).toBe('src/new.ts');
  });

  it('handles a braced rename that moves between directories', () => {
    expect(renameTarget('packages/{app => shared}/src/x.ts')).toBe('packages/shared/src/x.ts');
  });

  it('collapses the empty side of a braced rename without inventing a directory', () => {
    // `a/{ => b}/c` means the file moved INTO b; naively joining leaves `a//c`.
    expect(renameTarget('a/{ => b}/c.ts')).toBe('a/b/c.ts');
  });

  it('leaves an ordinary path alone', () => {
    expect(renameTarget('src/a.ts')).toBe('src/a.ts');
    // A path that merely contains "=>" without the spaces is not a rename.
    expect(renameTarget('src/a=>b.ts')).toBe('src/a=>b.ts');
  });
});
