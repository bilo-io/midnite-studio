import { describe, expect, it } from 'vitest';

import { parseReflogAction, parseReflogList, parseReflogRecord } from './reflog-parser';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

/** Build a record in exactly the shape REFLOG_FORMAT produces. */
const record = (fields: {
  selector?: string;
  fullSelector?: string;
  sha: string;
  subject?: string;
  author?: string;
}) =>
  [
    fields.selector ?? 'main@{1700000000}',
    fields.fullSelector ?? 'refs/heads/main@{1700000000}',
    fields.sha,
    fields.subject ?? 'commit: subject',
    fields.author ?? 'Ada Lovelace',
  ].join('\x00');

describe('parseReflogAction', () => {
  it('classifies each recognised prefix', () => {
    expect(parseReflogAction('commit: subject')).toBe('commit');
    expect(parseReflogAction('commit (amend): subject')).toBe('amend');
    expect(parseReflogAction('commit (initial): subject')).toBe('commit');
    expect(parseReflogAction('checkout: moving from main to feature')).toBe('checkout');
    expect(parseReflogAction('reset: moving to HEAD~2')).toBe('reset');
    expect(parseReflogAction('merge feature: Fast-forward')).toBe('merge');
    expect(parseReflogAction('rebase (pick): subject')).toBe('rebase');
    expect(parseReflogAction('rebase (start): checkout onto')).toBe('rebase');
    expect(parseReflogAction('cherry-pick: subject')).toBe('cherryPick');
    expect(parseReflogAction('revert: subject')).toBe('revert');
    expect(parseReflogAction('pull: Fast-forward')).toBe('pull');
    expect(parseReflogAction('branch: Created from HEAD')).toBe('branch');
  });

  it('degrades to other for a subject it does not recognise, rather than guessing', () => {
    expect(parseReflogAction('a future git version wrote this')).toBe('other');
  });
});

describe('parseReflogRecord', () => {
  it('parses an ordinary commit entry', () => {
    const entry = parseReflogRecord(record({ sha: SHA_A, subject: 'commit: first' }));

    expect(entry).toEqual({
      selector: 'main@{1700000000}',
      fullSelector: 'refs/heads/main@{1700000000}',
      sha: SHA_A,
      subject: 'commit: first',
      action: 'commit',
      at: 1700000000,
      author: 'Ada Lovelace',
    });
  });

  it('keeps the raw subject even when the action classifier cannot place it', () => {
    const subject = 'a future git version wrote this';
    const entry = parseReflogRecord(record({ sha: SHA_A, subject }));
    expect(entry?.subject).toBe(subject);
    expect(entry?.action).toBe('other');
  });

  it('keeps a subject containing a colon intact', () => {
    const subject = 'checkout: moving from feature/x: wip to main';
    expect(parseReflogRecord(record({ sha: SHA_A, subject }))?.subject).toBe(subject);
  });

  it('rejects a record whose sha field is not a sha', () => {
    expect(parseReflogRecord(record({ sha: 'not-a-sha' }))).toBeNull();
  });

  it('rejects a selector with no @{…} suffix at all', () => {
    expect(
      parseReflogRecord(['main', 'refs/heads/main', SHA_A, 'commit: x', 'Ada'].join('\x00')),
    ).toBeNull();
  });

  it('parses the embedded unix timestamp out of the selector', () => {
    expect(parseReflogRecord(record({ selector: 'main@{1700000042}', sha: SHA_A }))?.at).toBe(
      1700000042,
    );
  });

  it('rejects a record with too few fields', () => {
    expect(parseReflogRecord(['main@{1700000000}', SHA_A].join('\x00'))).toBeNull();
  });

  it('returns null for an empty record', () => {
    expect(parseReflogRecord('')).toBeNull();
  });
});

describe('parseReflogList', () => {
  it('returns an empty list for an empty payload', () => {
    expect(parseReflogList('')).toEqual([]);
  });

  it('pairs each entry with the sha of the next OLDER one (newest-first order)', () => {
    const payload = [
      record({ selector: 'main@{1700000002}', sha: SHA_A, subject: 'reset: moving to HEAD~1' }),
      record({ selector: 'main@{1700000001}', sha: SHA_B, subject: 'commit: second' }),
    ].join('\x00');

    const entries = parseReflogList(payload);
    expect(entries[0]).toMatchObject({ sha: SHA_A, oldSha: SHA_B });
    // The oldest entry in the page has no known predecessor.
    expect(entries[1]).toMatchObject({ sha: SHA_B, oldSha: null });
  });

  it('splits multiple records the way `-z` frames them — separated, not terminated', () => {
    const payload = [
      record({ selector: 'main@{1700000002}', sha: SHA_A }),
      record({ selector: 'main@{1700000001}', sha: SHA_B }),
    ].join('\x00');

    expect(parseReflogList(payload).map((e) => e.selector)).toEqual([
      'main@{1700000002}',
      'main@{1700000001}',
    ]);
  });

  it('drops a malformed record without losing its neighbours or misaligning the pairing', () => {
    const payload = [
      record({ selector: 'main@{1700000003}', sha: SHA_A }),
      'main@{1700000002}\x00refs/heads/main@{1700000002}\x00not-a-sha\x00commit: x\x00Ada',
      record({ selector: 'main@{1700000001}', sha: SHA_B }),
    ].join('\x00');

    const entries = parseReflogList(payload);
    expect(entries.map((e) => e.selector)).toEqual(['main@{1700000003}', 'main@{1700000001}']);
    expect(entries[0]?.oldSha).toBe(SHA_B);
  });

  it('keeps a subject containing an embedded newline-adjacent branch name intact', () => {
    // `-z` is what makes this safe: a plain newline-delimited read would
    // split a subject like this across two lines.
    const subject = 'checkout: moving from release/2024\nq4 to main';
    const payload = record({ sha: SHA_A, subject });
    expect(parseReflogList(payload)[0]?.subject).toBe(subject);
  });
});
