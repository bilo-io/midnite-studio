import { describe, expect, it } from 'vitest';
import { parseBlame } from './blame-parser';

describe('parseBlame', () => {
  it('parses multi-hunk blame sharing a commit metadata block', () => {
    const sha1 = '1111111111111111111111111111111111111111';
    const sha2 = '2222222222222222222222222222222222222222';

    const payload = [
      `${sha1} 1 1 1`,
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1700000000',
      'summary Initial commit',
      'filename test.txt',
      '\tFirst line',
      `${sha2} 2 2 1`,
      'author Bob',
      'author-mail <bob@example.com>',
      'author-time 1700001000',
      'summary Second commit',
      'previous ' + sha1 + ' test.txt',
      'filename test.txt',
      '\tSecond line',
      `${sha1} 2 3 1`,
      '\tThird line from first commit',
    ].join('\n');

    const result = parseBlame(payload, 'test.txt');

    expect(result.relPath).toBe('test.txt');
    expect(Object.keys(result.commits)).toEqual([sha1, sha2]);
    expect(result.commits[sha1]?.authorName).toBe('Alice');
    expect(result.commits[sha2]?.authorName).toBe('Bob');

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toEqual({
      sha: sha1,
      origLine: 1,
      finalLine: 1,
      text: 'First line',
      previous: null,
    });
    expect(result.lines[1]).toEqual({
      sha: sha2,
      origLine: 2,
      finalLine: 2,
      text: 'Second line',
      previous: { sha: sha1, path: 'test.txt' },
    });
    expect(result.lines[2]).toEqual({
      sha: sha1,
      origLine: 2,
      finalLine: 3,
      text: 'Third line from first commit',
      previous: null,
    });
  });
});
