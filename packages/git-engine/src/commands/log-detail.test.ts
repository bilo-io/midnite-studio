import { describe, expect, it } from 'vitest';

import { parseCommitDetail } from './log';

/** Build a record the way the `--pretty=format:` string does. */
const record = (fields: string[]) => fields.join('\x00');

const SHA = 'f11fafb4c693a8e38ad44f04e4908c15315843a3';
const PARENT = '7c521fed00d1b1a3f9e8c1d2b3a4958677665544';

const base = [
  SHA,
  PARENT,
  'feat: the subject',
  'Bilo Lwabona',
  'bilo@example.com',
  '1787000000',
  'GitHub',
  'noreply@github.com',
  '1787000100',
  'feat: the subject\n\nThe body.\n',
];

describe('parseCommitDetail', () => {
  it('reads every field in order', () => {
    const detail = parseCommitDetail(record(base), '');

    expect(detail).toEqual({
      sha: SHA,
      parents: [PARENT],
      subject: 'feat: the subject',
      body: 'feat: the subject\n\nThe body.\n',
      author: { name: 'Bilo Lwabona', email: 'bilo@example.com', date: 1_787_000_000 },
      committer: { name: 'GitHub', email: 'noreply@github.com', date: 1_787_000_100 },
      files: [],
    });
  });

  it('splits several parents and drops the root commit’s empty one', () => {
    const merge = [...base];
    merge[1] = `${PARENT} ${SHA}`;
    expect(parseCommitDetail(record(merge), '')?.parents).toEqual([PARENT, SHA]);

    const root = [...base];
    root[1] = '';
    // `%P` is empty for the root commit, whose naive split yields one
    // empty-string "parent" and a `parent 1` row pointing nowhere.
    expect(parseCommitDetail(record(root), '')?.parents).toEqual([]);
  });

  it('rejoins a body that itself contained the separator', () => {
    // `%B` is last in the format string for exactly this reason: any surplus
    // token belongs to the body, so it is rejoined rather than truncated.
    const odd = [...base, 'and more'];
    expect(parseCommitDetail(record(odd), '')?.body).toBe(
      'feat: the subject\n\nThe body.\n\x00and more',
    );
  });

  it('keeps a subject containing whitespace and colons whole', () => {
    // The reason the separator is NUL and not a space or a tab: a subject may
    // legally contain both, and a commit object may not contain NUL.
    const tabbed = [...base];
    tabbed[2] = 'fix:\tthe thing — and: more';
    expect(parseCommitDetail(record(tabbed), '')?.subject).toBe('fix:\tthe thing — and: more');
  });

  it('returns null for a truncated record', () => {
    expect(parseCommitDetail(record(base.slice(0, 5)), '')).toBeNull();
    expect(parseCommitDetail('', '')).toBeNull();
  });

  it('reads a malformed date as 0 rather than NaN', () => {
    // NaN reaches the renderer as `Invalid Date`; 0 reaches it as the epoch,
    // which at least renders and is visibly wrong rather than broken.
    const bad = [...base];
    bad[5] = 'not-a-number';
    expect(parseCommitDetail(record(bad), '')?.author.date).toBe(0);
  });

  it('parses the numstat payload alongside the record', () => {
    const numstat = '4\t1\tpackages/desktop/src/main/window.ts\x002\t0\t.github/workflows/ci.yml\x00';
    expect(parseCommitDetail(record(base), numstat)?.files).toEqual([
      {
        path: 'packages/desktop/src/main/window.ts',
        oldPath: null,
        insertions: 4,
        deletions: 1,
      },
      { path: '.github/workflows/ci.yml', oldPath: null, insertions: 2, deletions: 0 },
    ]);
  });
});
