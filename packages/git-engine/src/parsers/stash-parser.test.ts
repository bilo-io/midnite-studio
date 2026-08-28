import { describe, expect, it } from 'vitest';

import { parseStashList, parseStashRecord } from './stash-parser';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const SHA_D = 'd'.repeat(40);

/** Build a record in exactly the shape STASH_FORMAT produces. */
const record = (fields: {
  selector?: string;
  sha: string;
  parents?: string;
  message?: string;
  at?: string;
  name?: string;
  email?: string;
}) =>
  [
    fields.selector ?? 'stash@{0}',
    fields.sha,
    fields.parents ?? '',
    fields.message ?? 'WIP on main: 1a2b3c4 subject',
    fields.at ?? '1700000000',
    fields.name ?? 'Ada Lovelace',
    fields.email ?? 'ada@example.com',
  ].join('\x00');

describe('parseStashRecord', () => {
  it('parses a two-parent stash (no untracked files)', () => {
    const entry = parseStashRecord(
      record({ sha: SHA_A, parents: `${SHA_B} ${SHA_C}` }),
    );

    expect(entry).toEqual({
      selector: 'stash@{0}',
      sha: SHA_A,
      parents: [SHA_B, SHA_C],
      message: 'WIP on main: 1a2b3c4 subject',
      authoredAt: 1700000000,
      author: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
  });

  it('parses a three-parent stash (made with -u) distinctly from a two-parent one', () => {
    const entry = parseStashRecord(
      record({ sha: SHA_A, parents: `${SHA_B} ${SHA_C} ${SHA_D}` }),
    );

    expect(entry?.parents).toEqual([SHA_B, SHA_C, SHA_D]);
  });

  it('rejects a record whose first field is not a sha', () => {
    expect(parseStashRecord(record({ sha: 'not-a-sha' }))).toBeNull();
  });

  it('rejects a record with too few fields', () => {
    expect(parseStashRecord(['stash@{0}', SHA_A].join('\x00'))).toBeNull();
  });

  it('returns null for an empty record', () => {
    expect(parseStashRecord('')).toBeNull();
  });

  it('keeps a message containing commas and colons intact', () => {
    const message = 'On feature: fix, then: rework the thing';
    expect(parseStashRecord(record({ sha: SHA_A, message }))?.message).toBe(message);
  });
});

describe('parseStashList', () => {
  it('returns an empty list for an empty payload', () => {
    expect(parseStashList('')).toEqual([]);
  });

  it('splits multiple records the way `-z` frames them — separated, not terminated', () => {
    const payload = [
      record({ selector: 'stash@{0}', sha: SHA_A }),
      record({ selector: 'stash@{1}', sha: SHA_B, parents: SHA_C }),
    ].join('\x00');

    const entries = parseStashList(payload);
    expect(entries.map((e) => e.selector)).toEqual(['stash@{0}', 'stash@{1}']);
    expect(entries[1]?.sha).toBe(SHA_B);
  });

  it('drops a malformed record without losing its neighbours', () => {
    const payload = [
      record({ selector: 'stash@{0}', sha: SHA_A }),
      'stash@{1}\x00not-a-sha\x00\x00msg\x00123\x00name\x00email',
      record({ selector: 'stash@{2}', sha: SHA_B }),
    ].join('\x00');

    expect(parseStashList(payload).map((e) => e.selector)).toEqual(['stash@{0}', 'stash@{2}']);
  });
});
