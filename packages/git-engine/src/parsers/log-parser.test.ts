import { describe, expect, it } from 'vitest';

import { chunkRecords, parseDecorations, parseLog, parseLogRecord } from './log-parser';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

/** Build a record in exactly the shape LOG_FORMAT produces. */
const record = (fields: {
  sha: string;
  parents?: string;
  name?: string;
  email?: string;
  at?: string;
  ct?: string;
  decorations?: string;
  subject?: string;
}) =>
  [
    fields.sha,
    fields.parents ?? '',
    fields.name ?? 'Ada Lovelace',
    fields.email ?? 'ada@example.com',
    fields.at ?? '1700000000',
    fields.ct ?? '1700000001',
    fields.decorations ?? '',
    fields.subject ?? 'subject',
  ].join('\x00');

describe('parseLogRecord', () => {
  it('parses a commit with two parents', () => {
    const commit = parseLogRecord(
      record({ sha: SHA_A, parents: `${SHA_B} ${SHA_C}`, subject: 'Merge branch feature' }),
    );

    expect(commit).toEqual({
      sha: SHA_A,
      parents: [SHA_B, SHA_C],
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authorDate: 1700000000,
      committerDate: 1700000001,
      subject: 'Merge branch feature',
      refs: [],
    });
  });

  it('gives a root commit an empty parent list, not a list holding one empty string', () => {
    expect(parseLogRecord(record({ sha: SHA_A, parents: '' }))?.parents).toEqual([]);
  });

  it('keeps a subject that contains commas, arrows and colons intact', () => {
    // These are exactly the characters the decoration parser splits on — a
    // subject must never be touched by that logic.
    const subject = 'fix: HEAD -> main, tag: v1.0 handling';
    expect(parseLogRecord(record({ sha: SHA_A, subject }))?.subject).toBe(subject);
  });

  it('rejects a record whose first field is not a sha', () => {
    expect(parseLogRecord(record({ sha: 'not-a-sha' }))).toBeNull();
  });

  it('rejects a truncated record', () => {
    expect(parseLogRecord(`${SHA_A}\x00${SHA_B}\x00Ada`)).toBeNull();
  });

  it('rejects an empty record', () => {
    expect(parseLogRecord('')).toBeNull();
  });
});

describe('parseDecorations', () => {
  it('strips the HEAD arrow and the tag marker, keeping full ref names', () => {
    expect(
      parseDecorations(
        'HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0.0',
      ),
    ).toEqual(['refs/heads/main', 'refs/remotes/origin/main', 'refs/tags/v1.0.0']);
  });

  it('keeps a bare detached HEAD as its own decoration', () => {
    expect(parseDecorations('HEAD, refs/tags/v2')).toEqual(['HEAD', 'refs/tags/v2']);
  });

  it('returns nothing for an undecorated commit', () => {
    expect(parseDecorations('')).toEqual([]);
  });
});

describe('chunkRecords', () => {
  it('peels whole records and keeps the partial tail', () => {
    const payload = `${record({ sha: SHA_A })}\x00${SHA_B}\x00${SHA_C}`;
    const { records, remainder } = chunkRecords(payload);

    expect(records).toHaveLength(1);
    expect(remainder).toBe(`${SHA_B}\x00${SHA_C}`);
  });

  it('survives a chunk boundary landing exactly on a record separator', () => {
    // The silent-corruption case: counting NUL-split tokens leaves an empty
    // remainder here, so the next chunk starts with a leading NUL and every
    // field from then on is shifted by one.
    const full = `${record({ sha: SHA_A })}\x00${record({ sha: SHA_B, subject: 'second' })}`;
    const cut = full.indexOf('\x00' + SHA_B); // boundary immediately before the separator

    const first = chunkRecords(full.slice(0, cut));
    const second = chunkRecords(first.remainder + full.slice(cut));

    const commits = [...first.records, ...second.records, second.remainder].map(parseLogRecord);
    expect(commits.filter(Boolean).map((c) => c?.sha)).toEqual([SHA_A, SHA_B]);
    expect(commits.find((c) => c?.sha === SHA_B)?.subject).toBe('second');
  });

  it('reassembles a record split across two arbitrary chunks', () => {
    // The realistic failure: a pipe hands over bytes mid-subject.
    const full = `${record({ sha: SHA_A, subject: 'a long subject line' })}\x00${record({ sha: SHA_B })}`;
    const cut = full.indexOf('long') + 2;

    const first = chunkRecords(full.slice(0, cut));
    const second = chunkRecords(first.remainder + full.slice(cut));

    // Verified against real git: `log -z --pretty=format:` SEPARATES records, so
    // the final one arrives with no trailing NUL and stays in the remainder.
    // streamLog() flushes that tail when the child exits.
    const commits = [...first.records, ...second.records, second.remainder].map(parseLogRecord);
    expect(commits.map((c) => c?.sha)).toEqual([SHA_A, SHA_B]);
    expect(commits[0]?.subject).toBe('a long subject line');
  });

  it('holds the final unterminated record in the remainder', () => {
    // Not an edge case — it is what every complete `git log` payload looks like.
    const { records, remainder } = chunkRecords(record({ sha: SHA_A }));
    expect(records).toEqual([]);
    expect(parseLogRecord(remainder)?.sha).toBe(SHA_A);
  });
});

describe('parseLog', () => {
  it('parses a multi-commit payload', () => {
    const payload = [record({ sha: SHA_A }), record({ sha: SHA_B, parents: SHA_C })].join('\x00');
    expect(parseLog(payload).map((c) => c.sha)).toEqual([SHA_A, SHA_B]);
  });

  it('returns nothing for an empty repo', () => {
    expect(parseLog('')).toEqual([]);
  });
});
